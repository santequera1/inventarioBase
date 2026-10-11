import { createPurchaseOrderBody, idParam, listPurchaseOrdersQuery, okResponse, paginated, purchaseOrderSchema, receivePurchaseOrderBody, updatePurchaseOrderBody } from "@inventario/shared";
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

const include = { supplier: { select: { id: true, name: true } }, location: { select: { id: true, name: true } }, items: { include: { variant: { select: variantSelect } } } } as const;

function serialize(po: {
  id: string; number: string; status: string; supplierId: string; supplier: { id: string; name: string }; locationId: string; location: { id: string; name: string };
  reference: string | null; note: string | null; expectedAt: Date | null; orderedAt: Date | null; receivedAt: Date | null; createdAt: Date; updatedAt: Date;
  items: { id: string; variantId: string; quantity: number; receivedQuantity: number; unitCost: number; variant: Parameters<typeof serializeVariantRef>[0] }[];
}) {
  return {
    ...po,
    status: po.status as "DRAFT",
    expectedAt: po.expectedAt?.toISOString() ?? null,
    orderedAt: po.orderedAt?.toISOString() ?? null,
    receivedAt: po.receivedAt?.toISOString() ?? null,
    createdAt: po.createdAt.toISOString(),
    updatedAt: po.updatedAt.toISOString(),
    subtotal: po.items.reduce((a, i) => a + i.quantity * i.unitCost, 0),
    items: po.items.map((i) => ({ id: i.id, variantId: i.variantId, quantity: i.quantity, receivedQuantity: i.receivedQuantity, unitCost: i.unitCost, variant: serializeVariantRef(i.variant) })),
  };
}

async function place(tx: Tx, id: string, actor: Actor) {
  const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
  if (!po) throw E.notFound("La orden de compra");
  if (po.status !== "DRAFT") throw E.conflict("Solo se pueden pedir órdenes en borrador.");
  const movements: MovementInput[] = po.items.map((it) => ({ variantId: it.variantId, locationId: po.locationId, type: "PURCHASE_INCOMING", bucket: "INCOMING", quantity: it.quantity, referenceType: "PURCHASE_ORDER", referenceId: po.id, referenceLabel: po.number, reason: "Orden de compra pedida" }));
  const applied = await applyMovements(tx, movements, actor, { allowNegativeAvailable: false });
  await tx.purchaseOrder.update({ where: { id }, data: { status: "ORDERED", orderedAt: new Date() } });
  return applied;
}

/** Costo promedio ponderado tras una recepción. */
async function updateAverageCost(tx: Tx, variantId: string, receivedQty: number, unitCost: number) {
  const v = await tx.variant.findUnique({ where: { id: variantId }, include: { levels: true } });
  if (!v) return;
  const onHandBefore = v.levels.reduce((a, l) => a + l.available + l.committed + l.unavailable, 0) - receivedQty;
  const prevCost = v.cost ?? unitCost;
  const newCost = onHandBefore > 0 ? Math.round((onHandBefore * prevCost + receivedQty * unitCost) / (onHandBefore + receivedQty)) : unitCost;
  await tx.variant.update({ where: { id: variantId }, data: { cost: newCost } });
}

export default async function purchaseOrderRoutes(app: App) {
  app.get(
    "/purchase-orders",
    { preValidation: [app.guard("purchases.read", "read:suppliers")], schema: { tags: ["PurchaseOrders"], summary: "Listar órdenes de compra", querystring: listPurchaseOrdersQuery, response: { 200: paginated(purchaseOrderSchema) } } },
    async (request) => {
      const { status, supplier_id, location_id, q, cursor, limit, sort } = request.query;
      const where = {
        ...(status ? { status } : {}),
        ...(supplier_id ? { supplierId: supplier_id } : {}),
        ...(location_id ? { locationId: location_id } : {}),
        ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" as const } }, { reference: { contains: q, mode: "insensitive" as const } }, { supplier: { name: { contains: q, mode: "insensitive" as const } } }] } : {}),
      };
      const s = parseSort(sort, { created_at: "createdAt", updated_at: "updatedAt", expected_at: "expectedAt" }, { field: "createdAt", dir: "desc" });
      const [rows, total] = await Promise.all([
        app.db.purchaseOrder.findMany({ where, include, orderBy: [{ [s.field]: s.dir }, { id: "desc" }], ...cursorArgs(cursor, limit) }),
        cursor ? Promise.resolve(undefined) : app.db.purchaseOrder.count({ where }),
      ]);
      const page = buildPage(rows, limit, total);
      return { data: page.data.map(serialize), meta: page.meta };
    },
  );

  app.get(
    "/purchase-orders/:id",
    { preValidation: [app.guard("purchases.read", "read:suppliers")], schema: { tags: ["PurchaseOrders"], summary: "Orden de compra", params: idParam, response: { 200: purchaseOrderSchema } } },
    async (request) => {
      const po = await app.db.purchaseOrder.findUnique({ where: { id: request.params.id }, include });
      if (!po) throw E.notFound("La orden de compra");
      return serialize(po);
    },
  );

  app.post(
    "/purchase-orders",
    { preValidation: [app.guard("purchases.write", "write:suppliers")], config: { idempotent: true }, schema: { tags: ["PurchaseOrders"], summary: "Crear orden de compra", body: createPurchaseOrderBody, response: { 201: purchaseOrderSchema } } },
    async (request, reply) => {
      const b = request.body;
      const [supplier, location] = await Promise.all([app.db.supplier.findUnique({ where: { id: b.supplierId } }), app.db.location.findUnique({ where: { id: b.locationId } })]);
      if (!supplier) throw E.validation("El proveedor no existe.", [{ path: "supplierId", message: "Selecciona un proveedor válido." }]);
      if (!location) throw E.validation("La ubicación no existe.", [{ path: "locationId", message: "Selecciona una ubicación válida." }]);
      const { po, applied } = await withTx(app.db, async (tx) => {
        const number = await nextNumber(tx, "purchase_order", "OC-");
        const po = await tx.purchaseOrder.create({
          data: { number, supplierId: b.supplierId, locationId: b.locationId, reference: b.reference ?? null, note: b.note ?? null, expectedAt: b.expectedAt ? new Date(b.expectedAt) : null, createdById: request.actor!.id, items: { create: b.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, unitCost: i.unitCost })) } },
        });
        const applied = b.place ? await place(tx, po.id, request.actor!) : [];
        return { po, applied };
      });
      await emitInventoryEvents(app, applied, "purchase_order");
      await audit(app.db, request.actor!, "create", "purchase_order", po.id, { after: { number: po.number }, ip: request.ip });
      return reply.status(201).send(serialize(await app.db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include })));
    },
  );

  app.patch(
    "/purchase-orders/:id",
    { preValidation: [app.guard("purchases.write", "write:suppliers")], schema: { tags: ["PurchaseOrders"], summary: "Editar orden en borrador", params: idParam, body: updatePurchaseOrderBody, response: { 200: purchaseOrderSchema } } },
    async (request) => {
      const po = await app.db.purchaseOrder.findUnique({ where: { id: request.params.id } });
      if (!po) throw E.notFound("La orden de compra");
      const b = request.body;
      if (po.status !== "DRAFT" && (b.items || b.supplierId || b.locationId)) throw E.conflict("Solo se pueden editar artículos, proveedor y ubicación en borrador.");
      await withTx(app.db, async (tx) => {
        await tx.purchaseOrder.update({ where: { id: po.id }, data: { ...(b.supplierId ? { supplierId: b.supplierId } : {}), ...(b.locationId ? { locationId: b.locationId } : {}), ...(b.reference !== undefined ? { reference: b.reference } : {}), ...(b.note !== undefined ? { note: b.note } : {}), ...(b.expectedAt !== undefined ? { expectedAt: b.expectedAt ? new Date(b.expectedAt) : null } : {}) } });
        if (b.items) {
          await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
          await tx.purchaseOrderItem.createMany({ data: b.items.map((i) => ({ purchaseOrderId: po.id, variantId: i.variantId, quantity: i.quantity, unitCost: i.unitCost })) });
        }
      });
      return serialize(await app.db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include }));
    },
  );

  app.post(
    "/purchase-orders/:id/place",
    { preValidation: [app.guard("purchases.write", "write:suppliers")], config: { idempotent: true }, schema: { tags: ["PurchaseOrders"], summary: "Marcar como pedida (alimenta Entrante)", params: idParam, response: { 200: purchaseOrderSchema } } },
    async (request) => {
      const applied = await withTx(app.db, (tx) => place(tx, request.params.id, request.actor!));
      await emitInventoryEvents(app, applied, "purchase_order");
      await audit(app.db, request.actor!, "place", "purchase_order", request.params.id, { ip: request.ip });
      return serialize(await app.db.purchaseOrder.findUniqueOrThrow({ where: { id: request.params.id }, include }));
    },
  );

  app.post(
    "/purchase-orders/:id/receive",
    { preValidation: [app.guard("purchases.write", "write:suppliers")], config: { idempotent: true }, schema: { tags: ["PurchaseOrders"], summary: "Recibir mercancía (parcial o total): Entrante → Disponible y actualiza costo promedio", params: idParam, body: receivePurchaseOrderBody, response: { 200: purchaseOrderSchema } } },
    async (request) => {
      const applied = await withTx(app.db, async (tx) => {
        const po = await tx.purchaseOrder.findUnique({ where: { id: request.params.id }, include: { items: true } });
        if (!po) throw E.notFound("La orden de compra");
        if (po.status !== "ORDERED" && po.status !== "PARTIAL") throw E.conflict("Solo se puede recibir una orden pedida.");
        const movements: MovementInput[] = [];
        const costUpdates: { variantId: string; qty: number; unitCost: number }[] = [];
        let allDone = true;
        for (const it of po.items) {
          const pending = it.quantity - it.receivedQuantity;
          const req = request.body.items ? request.body.items.find((x) => x.variantId === it.variantId) : undefined;
          const qty = request.body.items ? (req?.quantity ?? 0) : pending;
          if (qty > pending) throw E.validation(`No puedes recibir más de lo pendiente (${pending}).`);
          const unitCost = req?.unitCost ?? it.unitCost;
          if (qty > 0) {
            movements.push({ variantId: it.variantId, locationId: po.locationId, type: "RECEIPT", bucket: "INCOMING", quantity: -qty, referenceType: "PURCHASE_ORDER", referenceId: po.id, referenceLabel: po.number, reason: "Recepción de compra", note: request.body.note ?? null });
            movements.push({ variantId: it.variantId, locationId: po.locationId, type: "RECEIPT", bucket: "AVAILABLE", quantity: qty, referenceType: "PURCHASE_ORDER", referenceId: po.id, referenceLabel: po.number, reason: "Recepción de compra", note: request.body.note ?? null });
            await tx.purchaseOrderItem.update({ where: { id: it.id }, data: { receivedQuantity: it.receivedQuantity + qty, unitCost } });
            costUpdates.push({ variantId: it.variantId, qty, unitCost });
          }
          if (it.receivedQuantity + qty < it.quantity) allDone = false;
        }
        const applied = await applyMovements(tx, movements, request.actor!, { allowNegativeAvailable: false });
        for (const c of costUpdates) await updateAverageCost(tx, c.variantId, c.qty, c.unitCost);
        await tx.purchaseOrder.update({ where: { id: po.id }, data: allDone ? { status: "RECEIVED", receivedAt: new Date() } : { status: "PARTIAL" } });
        return applied;
      });
      await emitInventoryEvents(app, applied, "purchase_order");
      const full = await app.db.purchaseOrder.findUniqueOrThrow({ where: { id: request.params.id }, include });
      if (full.status === "RECEIVED") void app.webhooks.emit("purchase_order.received", serialize(full));
      await audit(app.db, request.actor!, "receive", "purchase_order", full.id, { ip: request.ip });
      return serialize(full);
    },
  );

  app.post(
    "/purchase-orders/:id/cancel",
    { preValidation: [app.guard("purchases.write", "write:suppliers")], schema: { tags: ["PurchaseOrders"], summary: "Cancelar (retira lo pendiente de Entrante)", params: idParam, response: { 200: purchaseOrderSchema } } },
    async (request) => {
      const applied = await withTx(app.db, async (tx) => {
        const po = await tx.purchaseOrder.findUnique({ where: { id: request.params.id }, include: { items: true } });
        if (!po) throw E.notFound("La orden de compra");
        if (po.status === "RECEIVED" || po.status === "CANCELLED") throw E.conflict("Esta orden ya está cerrada.");
        const movements: MovementInput[] = [];
        if (po.status !== "DRAFT") {
          for (const it of po.items) {
            const pending = it.quantity - it.receivedQuantity;
            if (pending > 0) movements.push({ variantId: it.variantId, locationId: po.locationId, type: "CANCELLATION", bucket: "INCOMING", quantity: -pending, referenceType: "PURCHASE_ORDER", referenceId: po.id, referenceLabel: po.number, reason: "Orden de compra cancelada" });
          }
        }
        const applied = await applyMovements(tx, movements, request.actor!, { allowNegativeAvailable: false });
        await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: "CANCELLED" } });
        return applied;
      });
      await emitInventoryEvents(app, applied, "purchase_order");
      await audit(app.db, request.actor!, "cancel", "purchase_order", request.params.id, { ip: request.ip });
      return serialize(await app.db.purchaseOrder.findUniqueOrThrow({ where: { id: request.params.id }, include }));
    },
  );

  app.delete(
    "/purchase-orders/:id",
    { preValidation: [app.guard("purchases.write", "write:suppliers")], schema: { tags: ["PurchaseOrders"], summary: "Eliminar borrador", params: idParam, response: { 200: okResponse } } },
    async (request) => {
      const po = await app.db.purchaseOrder.findUnique({ where: { id: request.params.id } });
      if (!po) throw E.notFound("La orden de compra");
      if (po.status !== "DRAFT") throw E.conflict("Solo se pueden eliminar borradores.");
      await app.db.purchaseOrder.delete({ where: { id: po.id } });
      return { ok: true as const };
    },
  );
}
