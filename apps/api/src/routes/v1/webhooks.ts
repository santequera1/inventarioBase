import { z } from "zod";
import { createWebhookBody, createWebhookResponse, idParam, listDeliveriesQuery, okResponse, paginated, updateWebhookBody, webhookDeliverySchema, webhookSchema } from "@inventario/shared";
import type { App } from "../../app";
import { E } from "../../lib/errors";
import { generateWebhookSecret } from "../../lib/crypto";
import { audit } from "../../lib/audit";
import { buildPage, cursorArgs } from "../../lib/pagination";

async function serialize(app: App, w: { id: string; url: string; description: string | null; events: string[]; active: boolean; secret: string; failureCount: number; createdAt: Date }) {
  const last = await app.db.webhookDelivery.findFirst({ where: { webhookId: w.id }, orderBy: { createdAt: "desc" }, select: { status: true, createdAt: true } });
  return { id: w.id, url: w.url, description: w.description, events: w.events as never, active: w.active, secretPrefix: w.secret.slice(0, 10) + "…", lastDeliveryAt: last?.createdAt.toISOString() ?? null, lastStatus: (last?.status as never) ?? null, failureCount: w.failureCount, createdAt: w.createdAt.toISOString() };
}
const serializeDelivery = (d: { id: string; webhookId: string; event: string; status: string; attempts: number; nextAttemptAt: Date | null; responseStatus: number | null; responseBody: string | null; error: string | null; payload: unknown; durationMs: number | null; deliveredAt: Date | null; createdAt: Date }) => ({
  ...d, event: d.event as never, status: d.status as never, nextAttemptAt: d.nextAttemptAt?.toISOString() ?? null, deliveredAt: d.deliveredAt?.toISOString() ?? null, createdAt: d.createdAt.toISOString(),
});

export default async function webhookRoutes(app: App) {
  app.get(
    "/webhooks",
    { preValidation: [app.guard("webhooks.manage", "write:webhooks")], schema: { tags: ["Webhooks"], summary: "Listar webhooks", response: { 200: z.object({ data: z.array(webhookSchema) }) } } },
    async () => ({ data: await Promise.all((await app.db.webhook.findMany({ orderBy: { createdAt: "desc" } })).map((w) => serialize(app, w))) }),
  );
  app.post(
    "/webhooks",
    { preValidation: [app.guard("webhooks.manage", "write:webhooks")], schema: { tags: ["Webhooks"], summary: "Crear webhook (el secreto se muestra una sola vez)", body: createWebhookBody, response: { 201: createWebhookResponse } } },
    async (request, reply) => {
      const secret = generateWebhookSecret();
      const w = await app.db.webhook.create({ data: { url: request.body.url, description: request.body.description ?? null, events: request.body.events, active: request.body.active, secret } });
      await audit(app.db, request.actor!, "create", "webhook", w.id, { after: { url: w.url, events: w.events }, ip: request.ip });
      return reply.status(201).send({ webhook: await serialize(app, w), secret });
    },
  );
  app.patch(
    "/webhooks/:id",
    { preValidation: [app.guard("webhooks.manage", "write:webhooks")], schema: { tags: ["Webhooks"], summary: "Editar webhook", params: idParam, body: updateWebhookBody, response: { 200: webhookSchema } } },
    async (request) => {
      const w = await app.db.webhook.update({ where: { id: request.params.id }, data: { ...request.body, ...(request.body.active ? { failureCount: 0 } : {}) } });
      await audit(app.db, request.actor!, "update", "webhook", w.id, { after: { url: w.url, events: w.events, active: w.active }, ip: request.ip });
      return serialize(app, w);
    },
  );
  app.post(
    "/webhooks/:id/rotate-secret",
    { preValidation: [app.guard("webhooks.manage", null)], schema: { tags: ["Webhooks"], summary: "Rotar secreto", params: idParam, response: { 200: createWebhookResponse } } },
    async (request) => {
      const secret = generateWebhookSecret();
      const w = await app.db.webhook.update({ where: { id: request.params.id }, data: { secret } });
      await audit(app.db, request.actor!, "rotate_secret", "webhook", w.id, { ip: request.ip });
      return { webhook: await serialize(app, w), secret };
    },
  );
  app.post(
    "/webhooks/:id/test",
    { preValidation: [app.guard("webhooks.manage", "write:webhooks")], schema: { tags: ["Webhooks"], summary: "Enviar evento de prueba", params: idParam, response: { 200: webhookDeliverySchema } } },
    async (request) => {
      const w = await app.db.webhook.findUnique({ where: { id: request.params.id } });
      if (!w) throw E.notFound("El webhook");
      const d = await app.db.webhookDelivery.create({ data: { webhookId: w.id, event: w.events[0] ?? "inventory.updated", payload: { id: `evt_test_${Date.now()}`, event: w.events[0] ?? "inventory.updated", created_at: new Date().toISOString(), data: { test: true, message: "Evento de prueba desde Inventario Willy" } }, status: "PENDING", nextAttemptAt: new Date() } });
      await app.webhooks.attempt(d.id, true);
      return serializeDelivery(await app.db.webhookDelivery.findUniqueOrThrow({ where: { id: d.id } }));
    },
  );
  app.delete(
    "/webhooks/:id",
    { preValidation: [app.guard("webhooks.manage", "write:webhooks")], schema: { tags: ["Webhooks"], summary: "Eliminar webhook", params: idParam, response: { 200: okResponse } } },
    async (request) => {
      await app.db.webhook.delete({ where: { id: request.params.id } });
      await audit(app.db, request.actor!, "delete", "webhook", request.params.id, { ip: request.ip });
      return { ok: true as const };
    },
  );

  app.get(
    "/webhook-deliveries",
    { preValidation: [app.guard("webhooks.manage", "write:webhooks")], schema: { tags: ["Webhooks"], summary: "Registro de entregas", querystring: listDeliveriesQuery, response: { 200: paginated(webhookDeliverySchema) } } },
    async (request) => {
      const { webhook_id, status, event, cursor, limit } = request.query;
      const where = { ...(webhook_id ? { webhookId: webhook_id } : {}), ...(status ? { status } : {}), ...(event ? { event } : {}) };
      const [rows, total] = await Promise.all([
        app.db.webhookDelivery.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...cursorArgs(cursor, limit) }),
        cursor ? Promise.resolve(undefined) : app.db.webhookDelivery.count({ where }),
      ]);
      const page = buildPage(rows, limit, total);
      return { data: page.data.map(serializeDelivery), meta: page.meta };
    },
  );
  app.post(
    "/webhook-deliveries/:id/resend",
    { preValidation: [app.guard("webhooks.manage", "write:webhooks")], schema: { tags: ["Webhooks"], summary: "Reenviar entrega", params: idParam, response: { 200: webhookDeliverySchema } } },
    async (request) => {
      const d = await app.db.webhookDelivery.findUnique({ where: { id: request.params.id } });
      if (!d) throw E.notFound("La entrega");
      await app.webhooks.resend(d.id);
      return serializeDelivery(await app.db.webhookDelivery.findUniqueOrThrow({ where: { id: d.id } }));
    },
  );
}
