import type { FastifyBaseLogger } from "fastify";
import type { WebhookEvent } from "@inventario/shared";
import type { Db } from "../lib/prisma";
import { signWebhook } from "../lib/crypto";

const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 12 * 3600_000];
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1;

export class WebhookService {
  private timer: NodeJS.Timeout | null = null;
  private inflight: Promise<number> | null = null;
  constructor(
    private db: Db,
    private log: FastifyBaseLogger,
    private pollMs: number,
  ) {}

  /** Encola el evento para todos los webhooks activos suscritos. */
  async emit(event: WebhookEvent, data: unknown): Promise<number> {
    const hooks = await this.db.webhook.findMany({ where: { active: true, events: { has: event } } });
    if (hooks.length === 0) return 0;
    const payload = { id: `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, event, created_at: new Date().toISOString(), data };
    await this.db.webhookDelivery.createMany({
      data: hooks.map((h) => ({ webhookId: h.id, event, payload: payload as object, status: "PENDING", nextAttemptAt: new Date() })),
    });
    this.kick();
    return hooks.length;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.processDue(), this.pollMs);
    this.timer.unref();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  /** Procesa pronto sin esperar al siguiente tick. */
  kick() {
    setTimeout(() => void this.processDue(), 50).unref();
  }

  processDue(limit = 20): Promise<number> {
    if (this.inflight) return this.inflight;
    this.inflight = this.runDue(limit).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async runDue(limit: number): Promise<number> {
    let processed = 0;
    try {
      const due = await this.db.webhookDelivery.findMany({
        where: { status: { in: ["PENDING", "RETRYING"] }, nextAttemptAt: { lte: new Date() } },
        orderBy: { nextAttemptAt: "asc" },
        take: limit,
        include: { webhook: true },
      });
      for (const d of due) {
        await this.attempt(d.id);
        processed++;
      }
    } catch (err) {
      this.log.error({ err }, "webhook worker error");
    }
    return processed;
  }

  /** Intenta una entrega concreta (también usado para reenvío manual). */
  async attempt(deliveryId: string, manual = false): Promise<void> {
    const d = await this.db.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { webhook: true } });
    if (!d) return;
    if (!d.webhook.active && !manual) {
      await this.db.webhookDelivery.update({ where: { id: d.id }, data: { status: "FAILED", error: "Webhook inactivo", nextAttemptAt: null } });
      return;
    }
    const body = JSON.stringify(d.payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signWebhook(d.webhook.secret, timestamp, body);
    const started = Date.now();
    let responseStatus: number | null = null;
    let responseBody: string | null = null;
    let error: string | null = null;
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(d.webhook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "InventarioWilly-Webhooks/1.0",
          "x-webhook-id": d.id,
          "x-webhook-event": d.event,
          "x-webhook-timestamp": timestamp,
          "x-webhook-signature": `sha256=${signature}`,
        },
        body,
        signal: ctrl.signal,
      });
      clearTimeout(to);
      responseStatus = res.status;
      responseBody = (await res.text()).slice(0, 2000);
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (err) {
      error = err instanceof Error ? (err.name === "AbortError" ? "Tiempo de espera agotado (10 s)" : err.message) : String(err);
    }
    const durationMs = Date.now() - started;
    const attempts = d.attempts + 1;
    if (!error) {
      await this.db.$transaction([
        this.db.webhookDelivery.update({
          where: { id: d.id },
          data: { status: "SUCCESS", attempts, responseStatus, responseBody, error: null, durationMs, deliveredAt: new Date(), nextAttemptAt: null },
        }),
        this.db.webhook.update({ where: { id: d.webhookId }, data: { failureCount: 0 } }),
      ]);
      return;
    }
    const backoff = BACKOFF_MS[attempts - 1];
    const exhausted = manual ? true : backoff === undefined;
    await this.db.$transaction([
      this.db.webhookDelivery.update({
        where: { id: d.id },
        data: {
          status: exhausted ? "FAILED" : "RETRYING",
          attempts,
          responseStatus,
          responseBody,
          error,
          durationMs,
          nextAttemptAt: exhausted ? null : new Date(Date.now() + (backoff ?? 0)),
        },
      }),
      this.db.webhook.update({ where: { id: d.webhookId }, data: { failureCount: { increment: 1 } } }),
    ]);
  }

  /** Reenvío manual: reinicia el estado y lo intenta ya. */
  async resend(deliveryId: string) {
    await this.db.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "PENDING", nextAttemptAt: new Date() } });
    await this.attempt(deliveryId, true);
  }
}
