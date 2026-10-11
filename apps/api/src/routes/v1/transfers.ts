import { z } from "zod";
import { createTransferBody, idParam, listTransfersQuery, okResponse, paginated, receiveTransferBody, transferSchema } from "@inventario/shared";
import type { App } from "../../app";
import { E } from "../../lib/errors";
import { buildPage, cursorArgs, parseSort } from "../../lib/pagination";
import { withTx, type Tx } from "../../lib/prisma";
import { nextNumber } from "../../lib/numbering";
import { audit } from "../../lib/audit";
import type { Actor } from "../../lib/actor";
import { applyMovements, type MovementInput } from "../../services/inventory";
import { emitInventoryEvents } from "../../services/inventory-events";
import { serializeVariantRef, variantSelect } from "./inventory";

const include = { origin: { select: { id: true, name: true } }, destination: { select: { id: true, name: true } }, items: { include: { variant: { select: variantSelect } } } } as const;

function serialize(t: {
  id: string; number: string; status: string; originLocationId: string; destinationLocationId: string; origin: { id: string; name: string }; destination: { id: string; name: string };
  note: string | null; expectedAt: Date | null; dispatchedAt: Date | null; receivedAt: Date | null; createdAt: Date; updatedAt: Date;
  items: { id: string; variantId: string; quantity: number; receivedQuantity: number; variant: Parameters<typeof serializeVariantRef>[0] }[];
}) {
  return {
    ...t,
    status: t.status as "PENDING",
    expectedAt: t.expectedAt?.toISOString() ?? null,
    dispatchedAt: t.dispatchedAt?.toISOString() ?? null,
    receivedAt: t.receivedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    items: t.items.map((i) => ({ id: i.id, variantId: i.variantId, quantity: i.quantity, receivedQuantity: i.receivedQuantity, variant: serializeVariantRef(i.variant) })),
    totalQuantity: t.items.reduce((a, i) => a + i.quantity, 0),
  };
}

async function dispatch(tx: Tx, id: string, actor: Actor, allowNegative: boolean) {
  const t = await tx.transfer.findUnique({ where: { id }, include: { items: true } });
  if (!t) throw E.notFound("La transferencia");
  if (t.status !== "PENDING" && t.status !== "DRAFT") throw E.conflict(`La transferencia ya está en estado ${t.status}.`);
  const movements: MovementInput[] = [];
  for (const it of t.items) {
    movements.push({ variantId: it.variantId, locationId: t.originLocationId, type: "TRANSFER_OUT", bucket: "AVAILABLE", quantity: -it.quantity, referenceType: "TRANSFER", referenceId: t.id, referenceLabel: t.number, reason: "Transferencia enviada" });
    movements.push({ variantId: it.variantId, locationId: t.destinationLocationId, type: "TRANSFER_IN", bucket: "INCOMING", quantity: it.quantity, referenceType: "TRANSFER", referenceId: t.id, referenceLabel: t.number, reason: "Transferencia en camino" });
  }
  const applied = await applyMovements(tx, movements, actor, { allowNegativeAvailable: allowNegative });
  await tx.transfer.update({ where: { id }, data: { status: "IN_TRANSIT", dispatchedAt: new Date() } });
  return applied;
}

export default async function transferRoutes(app: App) {
  app.get(
    "/transfers",
    { preValidation: [app.guard("inventory.read", "read:inventory")], schema: { tags: ["Transfers"], summary: "Listar transferencias", querystring: listTransfersQuery, response: { 200: paginated(transferSchema) } } },
    async (request) => {
      const { status, location_id, q, cursor, limit, sort } = request.query;
      const where = {
        ...(status ? { status } : {}),
        ...(location_id ? { OR: [{ originLocationId: location_id }, { destinationLocationId: location_id }] } : {}),
        ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" as const } }, { note: { contains: q, mode: "insensitive" as const } }] } : {}),
      };
      const s = parseSort(sort, { created_at: "createdAt", updated_at: "updatedAt", number: "number" }, { field: "createdAt", dir: "desc" });
      const [rows, total] = await Promise.all([
        app.db.transfer.findMany({ where, include, orderBy: [{ [s.field]: s.dir }, { id: "desc" }], ...cursorArgs(cursor, limit) }),
        cursor ? Promise.resolve(undefined) : app.db.transfer.count({ where }),
      ]);
      const page = buildPage(rows, limit, total);
      return { data: page.data.map(serialize), meta: page.meta };
    },
  );

  app.get(
    "/transfers/:id",
    { preValidation: [app.guard("inventory.read", "read:inventory")], schema: { tags: ["Transfers"], summary: "Transferencia", params: idParam, response: { 200: transferSchema } } },
    async (request) => {
      const t = await app.db.transfer.findUnique({ where: { id: request.params.id }, include });
      if (!t) throw E.notFound("La transferencia");
      return serialize(t);
    },
  );

  app.post(
    "/transfers",
    {
      preValidation: [app.guard("inventory.transfer", "write:inventory")],
      config: { idempotent: true },
      schema: { tags: ["Transfers"], summary: "Crear transferencia", description: "Con `dispatch: true` descuenta el origen y marca entrante en el destino de inmediato.", body: createTransferBody, response: { 201: transferSchema } },
    },
    async (request, reply) => {
      const b = request.body;
      const settings = await app.settings();
      const locs = await app.db.location.findMany({ where: { id: { in: [b.originLocationId, b.destinationLocationId] }, active: true } });
      if (locs.length !== 2) throw E.validation("Origen o destino no existen o están inactivos.");
      // Consolida duplicados
      const qty = new Map<string, number>();
      for (const it of b.items) qty.set(it.variantId, (qty.get(it.variantId) ?? 0) + it.quantity);
      const variants = await app.db.variant.count({ where: { id: { in: [...qty.keys()] } } });
      if (variants !== qty.size) throw E.validation("Alguna variante no existe.");
      const { transfer, applied } = await withTx(app.db, async (tx) => {
        const number = await nextNumber(tx, "transfer", "TR-");
        const transfer = await tx.transfer.create({
          data: {
            number,
            status: "PENDING",
            originLocationId: b.originLocationId,
            destinationLocationId: b.destinationLocationId,
            note: b.note ?? null,
            expectedAt: b.expectedAt ? new Date(b.expectedAt) : null,
            createdById: request.actor!.id,
            items: { create: [...qty.entries()].map(([variantId, quantity]) => ({ variantId, quantity })) },
          },
        });
        const applied = b.dispatch ? await dispatch(tx, transfer.id, request.actor!, settings.allowNegativeStock) : [];
        return { transfer, applied };
      });
      await emitInventoryEvents(app, applied, "transfer");
      await audit(app.db, request.actor!, "create", "transfer", transfer.id, { after: { number: transfer.number, dispatch: b.dispatch }, ip: request.ip });
      const full = await app.db.transfer.findUniqueOrThrow({ where: { id: transfer.id }, include });
      return reply.status(201).send(serialize(full));
    },
  );

  app.post(
    "/transfers/:id/dispatch",
    { preValidation: [app.guard("inventory.transfer", "write:inventory")], config: { idempotent: true }, schema: { tags: ["Transfers"], summary: "Despachar (descuenta origen, entrante en destino)", params: idParam, response: { 200: transferSchema } } },
    async (request) => {
      const settings = await app.settings();
      const applied = await withTx(app.db, (tx) => dispatch(tx, request.params.id, request.actor!, settings.allowNegativeStock));
      await emitInventoryEvents(app, applied, "transfer");
      await audit(app.db, request.actor!, "dispatch", "transfer", request.params.id, { ip: request.ip });
      return serialize(await app.db.transfer.findUniqueOrThrow({ where: { id: request.params.id }, include }));
    },
  );

  app.post(
    "/transfers/:id/receive",
    { preValidation: [app.guard("inventory.transfer", "write:inventory")], config: { idempotent: true }, schema: { tags: ["Transfers"], summary: "Recibir (total o parcial) en destino", params: idParam, body: receiveTransferBody, response: { 200: transferSchema } } },
    async (request) => {
      const settings = await app.settings();
      const applied = await withTx(app.db, async (tx) => {
        const t = await tx.transfer.findUnique({ where: { id: request.params.id }, include: { items: true } });
        if (!t) throw E.notFound("La transferencia");
        if (t.status !== "IN_TRANSIT") throw E.conflict("Solo se pueden recibir transferencias en tránsito. Despáchala primero.");
        const movements: MovementInput[] = [];
        let allDone = true;
        for (const it of t.items) {
          const pending = it.quantity - it.receivedQuantity;
          const requested = request.body.items ? (request.body.items.find((x) => x.variantId === it.variantId)?.quantity ?? 0) : pending;
          if (requested > pending) throw E.validation(`No puedes recibir más de lo pendiente (${pending}) para la variante ${it.variantId}.`);
          if (requested > 0) {
            movements.push({ variantId: it.variantId, locationId: t.destinationLocationId, type: "TRANSFER_IN", bucket: "INCOMING", quantity: -requested, referenceType: "TRANSFER", referenceId: t.id, referenceLabel: t.number, reason: "Transferencia recibida" });
            movements.push({ variantId: it.variantId, locationId: t.destinationLocationId, type: "TRANSFER_IN", bucket: "AVAILABLE", quantity: requested, referenceType: "TRANSFER", referenceId: t.id, referenceLabel: t.number, reason: "Transferencia recibida" });
            await tx.transferItem.update({ where: { id: it.id }, data: { receivedQuantity: it.receivedQuantity + requested } });
          }
          if (it.receivedQuantity + requested < it.quantity) allDone = false;
        }
        const applied = await applyMovements(tx, movements, request.actor!, { allowNegativeAvailable: settings.allowNegativeStock });
        if (allDone) await tx.transfer.update({ where: { id: t.id }, data: { status: "RECEIVED", receivedAt: new Date() } });
        return applied;
      });
      await emitInventoryEvents(app, applied, "transfer");
      const full = await app.db.transfer.findUniqueOrThrow({ where: { id: request.params.id }, include });
      if (full.status === "RECEIVED") void app.webhooks.emit("transfer.received", serialize(full));
      await audit(app.db, request.actor!, "receive", "transfer", full.id, { ip: request.ip });
      return serialize(full);
    },
  );

  app.post(
    "/transfers/:id/cancel",
    { preValidation: [app.guard("inventory.transfer", "write:inventory")], schema: { tags: ["Transfers"], summary: "Cancelar (si está en tránsito, devuelve lo no recibido al origen)", params: idParam, response: { 200: transferSchema } } },
    async (request) => {
      const settings = await app.settings();
      const applied = await withTx(app.db, async (tx) => {
        const t = await tx.transfer.findUnique({ where: { id: request.params.id }, include: { items: true } });
        if (!t) throw E.notFound("La transferencia");
        if (t.status === "RECEIVED" || t.status === "CANCELLED") throw E.conflict(`No se puede cancelar una transferencia ${t.status === "RECEIVED" ? "recibida" : "ya cancelada"}.`);
        const movements: MovementInput[] = [];
        if (t.status === "IN_TRANSIT") {
          for (const it of t.items) {
            const pending = it.quantity - it.receivedQuantity;
            if (pending <= 0) continue;
            movements.push({ variantId: it.variantId, locationId: t.destinationLocationId, type: "CANCELLATION", bucket: "INCOMING", quantity: -pending, referenceType: "TRANSFER", referenceId: t.id, referenceLabel: t.number, reason: "Transferencia cancelada" });
            movements.push({ variantId: it.variantId, locationId: t.originLocationId, type: "CANCELLATION", bucket: "AVAILABLE", quantity: pending, referenceType: "TRANSFER", referenceId: t.id, referenceLabel: t.number, reason: "Transferencia cancelada" });
          }
        }
        const applied = await applyMovements(tx, movements, request.actor!, { allowNegativeAvailable: settings.allowNegativeStock });
        await tx.transfer.update({ where: { id: t.id }, data: { status: "CANCELLED" } });
        return applied;
      });
      await emitInventoryEvents(app, applied, "transfer");
      await audit(app.db, request.actor!, "cancel", "transfer", request.params.id, { ip: request.ip });
      return serialize(await app.db.transfer.findUniqueOrThrow({ where: { id: request.params.id }, include }));
    },
  );

  app.delete(
    "/transfers/:id",
    { preValidation: [app.guard("inventory.transfer", "write:inventory")], schema: { tags: ["Transfers"], summary: "Eliminar borrador/pendiente", params: idParam, response: { 200: okResponse } } },
    async (request) => {
      const t = await app.db.transfer.findUnique({ where: { id: request.params.id } });
      if (!t) throw E.notFound("La transferencia");
      if (t.status !== "PENDING" && t.status !== "DRAFT") throw E.conflict("Solo se pueden eliminar transferencias pendientes.");
      await app.db.transfer.delete({ where: { id: t.id } });
      return { ok: true as const };
    },
  );
  void z;
}
