import type { MovementType, StockBucket } from "@inventario/shared";
import type { Tx } from "../lib/prisma";
import { E } from "../lib/errors";
import { actorFields, type Actor } from "../lib/actor";

export type MovementInput = {
  variantId: string;
  locationId: string;
  type: MovementType;
  bucket: StockBucket;
  /** Con signo: positivo entra al bucket, negativo sale. */
  quantity: number;
  reason?: string | null;
  note?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  referenceLabel?: string | null;
};

export type LevelRow = {
  id: string;
  variantId: string;
  locationId: string;
  available: number;
  committed: number;
  unavailable: number;
  incoming: number;
  minStock: number | null;
};

export type AppliedMovement = {
  id: string;
  variantId: string;
  locationId: string;
  type: string;
  bucket: string;
  quantity: number;
  availableAfter: number;
  committedAfter: number;
  unavailableAfter: number;
  incomingAfter: number;
  level: LevelRow;
};

const BUCKET_FIELD: Record<StockBucket, keyof Pick<LevelRow, "available" | "committed" | "unavailable" | "incoming">> = {
  AVAILABLE: "available",
  COMMITTED: "committed",
  UNAVAILABLE: "unavailable",
  INCOMING: "incoming",
};

/**
 * Bloquea (FOR UPDATE) y devuelve el nivel de inventario, creándolo si no existe.
 * Siempre bloquear en orden determinista (variantId, locationId) para evitar deadlocks.
 */
export async function lockLevel(tx: Tx, variantId: string, locationId: string): Promise<LevelRow> {
  const select = async () =>
    tx.$queryRaw<LevelRow[]>`
      SELECT id, "variantId", "locationId", available, committed, unavailable, incoming, "minStock"
      FROM "InventoryLevel" WHERE "variantId" = ${variantId} AND "locationId" = ${locationId} FOR UPDATE`;
  let rows = await select();
  if (rows.length === 0) {
    await tx.$executeRaw`
      INSERT INTO "InventoryLevel" (id, "variantId", "locationId", available, committed, unavailable, incoming, "updatedAt")
      VALUES (${cuid()}, ${variantId}, ${locationId}, 0, 0, 0, 0, now())
      ON CONFLICT ("variantId", "locationId") DO NOTHING`;
    rows = await select();
  }
  const row = rows[0];
  if (!row) throw new Error("No se pudo bloquear el nivel de inventario");
  return row;
}

function cuid() {
  // cuid simple compatible (Prisma acepta cualquier string como id)
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
}

export type ApplyOptions = { allowNegativeAvailable: boolean };

/**
 * Aplica una lista de movimientos de forma atómica dentro de `tx`:
 * 1. bloquea los niveles implicados en orden determinista,
 * 2. valida que ningún bucket quede negativo (salvo AVAILABLE si la política lo permite),
 * 3. actualiza niveles e inserta los movimientos (append-only) con el saldo resultante.
 */
export async function applyMovements(
  tx: Tx,
  inputs: MovementInput[],
  actor: Actor,
  opts: ApplyOptions,
): Promise<AppliedMovement[]> {
  if (inputs.length === 0) return [];
  const keys = [...new Set(inputs.map((m) => `${m.variantId}|${m.locationId}`))].sort();
  const levels = new Map<string, LevelRow>();
  for (const k of keys) {
    const [variantId, locationId] = k.split("|") as [string, string];
    levels.set(k, await lockLevel(tx, variantId, locationId));
  }

  const applied: AppliedMovement[] = [];
  for (const m of inputs) {
    if (!Number.isInteger(m.quantity)) throw E.validation("La cantidad debe ser un número entero.");
    if (m.quantity === 0) continue;
    const key = `${m.variantId}|${m.locationId}`;
    const level = levels.get(key)!;
    const field = BUCKET_FIELD[m.bucket];
    const next = level[field] + m.quantity;
    if (next < 0) {
      const allowed = m.bucket === "AVAILABLE" && opts.allowNegativeAvailable;
      if (!allowed) {
        throw E.insufficientStock(
          `Stock insuficiente: ${bucketLabel(m.bucket)} actual ${level[field]}, se intentó ${m.quantity > 0 ? "sumar" : "restar"} ${Math.abs(m.quantity)}.`,
          { variantId: m.variantId, locationId: m.locationId, bucket: m.bucket, current: level[field], requested: m.quantity },
        );
      }
    }
    level[field] = next;
    await tx.inventoryLevel.update({
      where: { id: level.id },
      data: { [field]: next },
    });
    const mov = await tx.inventoryMovement.create({
      data: {
        variantId: m.variantId,
        locationId: m.locationId,
        type: m.type,
        bucket: m.bucket,
        quantity: m.quantity,
        availableAfter: level.available,
        committedAfter: level.committed,
        unavailableAfter: level.unavailable,
        incomingAfter: level.incoming,
        reason: m.reason ?? null,
        note: m.note ?? null,
        referenceType: m.referenceType ?? null,
        referenceId: m.referenceId ?? null,
        referenceLabel: m.referenceLabel ?? null,
        ...actorFields(actor),
      },
    });
    applied.push({
      id: mov.id,
      variantId: m.variantId,
      locationId: m.locationId,
      type: m.type,
      bucket: m.bucket,
      quantity: m.quantity,
      availableAfter: level.available,
      committedAfter: level.committed,
      unavailableAfter: level.unavailable,
      incomingAfter: level.incoming,
      level: { ...level },
    });
  }
  return applied;
}

function bucketLabel(b: StockBucket) {
  return { AVAILABLE: "disponible", COMMITTED: "comprometido", UNAVAILABLE: "no disponible", INCOMING: "entrante" }[b];
}

export type AdjustmentCommand = {
  variantId: string;
  locationId: string;
  mode: "delta" | "set";
  bucket: "AVAILABLE" | "UNAVAILABLE";
  quantity: number;
  reason: string;
  note?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  referenceLabel?: string | null;
};

/** Convierte un ajuste (delta|set) en movimiento, bloqueando el nivel para calcular el delta real en modo set. */
export async function applyAdjustments(
  tx: Tx,
  commands: AdjustmentCommand[],
  actor: Actor,
  opts: ApplyOptions,
  type: MovementType = "ADJUSTMENT",
): Promise<AppliedMovement[]> {
  const inputs: MovementInput[] = [];
  // Bloqueo previo en orden para modo set (necesitamos el valor actual).
  const sorted = [...commands].sort((a, b) => `${a.variantId}|${a.locationId}`.localeCompare(`${b.variantId}|${b.locationId}`));
  const levels = new Map<string, LevelRow>();
  for (const c of sorted) {
    const k = `${c.variantId}|${c.locationId}`;
    if (!levels.has(k)) levels.set(k, await lockLevel(tx, c.variantId, c.locationId));
  }
  for (const c of commands) {
    const level = levels.get(`${c.variantId}|${c.locationId}`)!;
    const field = BUCKET_FIELD[c.bucket];
    let delta: number;
    if (c.mode === "set") {
      if (c.quantity < 0 && !(c.bucket === "AVAILABLE" && opts.allowNegativeAvailable)) {
        throw E.validation("La cantidad final no puede ser negativa.");
      }
      delta = c.quantity - level[field];
      level[field] = c.quantity; // mantiene coherencia si hay varios comandos sobre el mismo nivel
    } else {
      delta = c.quantity;
      level[field] += delta;
    }
    if (delta === 0) continue;
    inputs.push({
      variantId: c.variantId,
      locationId: c.locationId,
      type,
      bucket: c.bucket,
      quantity: delta,
      reason: c.reason,
      note: c.note ?? null,
      referenceType: c.referenceType ?? null,
      referenceId: c.referenceId ?? null,
      referenceLabel: c.referenceLabel ?? null,
    });
  }
  // Revertimos la simulación: applyMovements vuelve a leer (FOR UPDATE es reentrante en la misma tx).
  return applyMovements(tx, inputs, actor, opts);
}

/** Mueve unidades entre Disponible y No disponible (dañado, revisión...). */
export async function applyStateChange(
  tx: Tx,
  cmd: {
    variantId: string;
    locationId: string;
    from: "AVAILABLE" | "UNAVAILABLE";
    to: "AVAILABLE" | "UNAVAILABLE";
    quantity: number;
    reason: string;
    note?: string | null;
  },
  actor: Actor,
  opts: ApplyOptions,
): Promise<AppliedMovement[]> {
  if (cmd.quantity <= 0) throw E.validation("Introduce una cantidad entera mayor que cero.");
  const ref = `state:${Date.now()}`;
  return applyMovements(
    tx,
    [
      { variantId: cmd.variantId, locationId: cmd.locationId, type: "STATE_CHANGE", bucket: cmd.from, quantity: -cmd.quantity, reason: cmd.reason, note: cmd.note, referenceType: "STATE_CHANGE", referenceId: ref },
      { variantId: cmd.variantId, locationId: cmd.locationId, type: "STATE_CHANGE", bucket: cmd.to, quantity: cmd.quantity, reason: cmd.reason, note: cmd.note, referenceType: "STATE_CHANGE", referenceId: ref },
    ],
    actor,
    { allowNegativeAvailable: false },
  );
}

export function onHand(l: { available: number; committed: number; unavailable: number }): number {
  return l.available + l.committed + l.unavailable;
}

export function stockState(l: { available: number; minStock: number | null }, threshold: number): "in_stock" | "low_stock" | "out_of_stock" {
  if (l.available <= 0) return "out_of_stock";
  const min = l.minStock ?? threshold;
  if (l.available <= min) return "low_stock";
  return "in_stock";
}

/** Recalcula un nivel sumando su libro mayor y devuelve diferencias (para conciliación). */
export async function reconcileLevel(tx: Tx, variantId: string, locationId: string) {
  const sums = await tx.$queryRaw<{ bucket: string; total: bigint }[]>`
    SELECT bucket, COALESCE(SUM(quantity),0)::bigint AS total FROM "InventoryMovement"
    WHERE "variantId" = ${variantId} AND "locationId" = ${locationId} GROUP BY bucket`;
  const ledger = { available: 0, committed: 0, unavailable: 0, incoming: 0 };
  for (const s of sums) {
    const f = BUCKET_FIELD[s.bucket as StockBucket];
    if (f) ledger[f] = Number(s.total);
  }
  const level = await tx.inventoryLevel.findUnique({ where: { variantId_locationId: { variantId, locationId } } });
  const current = level
    ? { available: level.available, committed: level.committed, unavailable: level.unavailable, incoming: level.incoming }
    : { available: 0, committed: 0, unavailable: 0, incoming: 0 };
  const matches =
    ledger.available === current.available &&
    ledger.committed === current.committed &&
    ledger.unavailable === current.unavailable &&
    ledger.incoming === current.incoming;
  return { ledger, current, matches };
}
