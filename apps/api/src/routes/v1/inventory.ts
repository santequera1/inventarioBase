import { z } from "zod";
import {
  adjustmentInput,
  adjustmentPreviewResponse,
  bulkAdjustmentBody,
  inventoryLevelSchema,
  listInventoryQuery,
  listMovementsQuery,
  movementSchema,
  paginated,
  setMinStockBody,
  stateChangeBody,
} from "@inventario/shared";
import type { App } from "../../app";
import { E } from "../../lib/errors";
import { buildPage, cursorArgs, parseExpand, parseSort } from "../../lib/pagination";
import { withTx, Prisma } from "../../lib/prisma";
import { parseDateInput } from "../../lib/dates";
import { applyAdjustments, applyStateChange, onHand, type AdjustmentCommand } from "../../services/inventory";
import { emitInventoryEvents } from "../../services/inventory-events";
import { toCsv } from "../../lib/csv";

export const variantSelect = {
  id: true,
  title: true,
  sku: true,
  barcode: true,
  price: true,
  cost: true,
  optionValues: true,
  image: { select: { thumbPath: true } },
  product: { select: { id: true, title: true, status: true, images: { orderBy: { position: "asc" as const }, take: 1, select: { thumbPath: true } } } },
} as const;

export function serializeVariantRef(v: {
  id: string; title: string; sku: string; barcode: string | null; price: number; cost: number | null; optionValues: unknown;
  image: { thumbPath: string } | null; product: { id: string; title: string; status: string; images: { thumbPath: string }[] };
}) {
  return {
    id: v.id,
    title: v.title,
    sku: v.sku,
    barcode: v.barcode,
    price: v.price,
    cost: v.cost,
    optionValues: (v.optionValues as Record<string, string>) ?? {},
    product: { id: v.product.id, title: v.product.title, status: v.product.status, thumbUrl: v.image ? `/uploads/${v.image.thumbPath}` : v.product.images[0] ? `/uploads/${v.product.images[0].thumbPath}` : null },
  };
}

export function serializeLevel(l: {
  id: string; variantId: string; locationId: string; available: number; committed: number; unavailable: number; incoming: number; minStock: number | null; updatedAt: Date;
  variant?: Parameters<typeof serializeVariantRef>[0]; location?: { id: string; name: string };
}) {
  return {
    id: l.id,
    variantId: l.variantId,
    locationId: l.locationId,
    available: l.available,
    committed: l.committed,
    unavailable: l.unavailable,
    incoming: l.incoming,
    onHand: onHand(l),
    minStock: l.minStock,
    updatedAt: l.updatedAt.toISOString(),
    ...(l.variant ? { variant: serializeVariantRef(l.variant) } : {}),
    ...(l.location ? { location: l.location } : {}),
  };
}

async function resolveReason(app: App, reasonId: string | undefined, reason: string | undefined): Promise<string> {
  if (reasonId) {
    const r = await app.db.reason.findUnique({ where: { id: reasonId } });
    if (!r) throw E.validation("El motivo seleccionado no existe.", [{ path: "reasonId", message: "Selecciona un motivo válido." }]);
    return r.name;
  }
  if (reason && reason.trim().length >= 2) return reason.trim();
  throw E.validation("El motivo es obligatorio.", [{ path: "reason", message: "Introduce un motivo." }]);
}

export default async function inventoryRoutes(app: App) {
  // ---------- Niveles ----------
  app.get(
    "/inventory-levels",
    {
      preValidation: [app.guard("inventory.read", "read:inventory")],
      schema: { tags: ["Inventory"], summary: "Niveles de inventario por variante y ubicación", querystring: listInventoryQuery, response: { 200: paginated(inventoryLevelSchema) } },
    },
    async (request) => {
      const { q, location_id, category_id, sku, variant_id, stock_state, updated_since, cursor, limit, sort } = request.query;
      const settings = await app.settings();
      const where: Prisma.InventoryLevelWhereInput = {
        ...(location_id ? { locationId: location_id } : {}),
        ...(variant_id ? { variantId: variant_id } : {}),
        ...(updated_since ? { updatedAt: { gte: new Date(updated_since) } } : {}),
        variant: {
          product: { status: { not: "ARCHIVED" }, ...(category_id ? { categoryId: category_id } : {}) },
          ...(sku ? { sku: { equals: sku, mode: "insensitive" } } : {}),
          ...(q ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { barcode: { equals: q } }, { title: { contains: q, mode: "insensitive" } }, { product: { title: { contains: q, mode: "insensitive" } } }] } : {}),
        },
      };
      if (stock_state === "out_of_stock") where.available = { lte: 0 };
      if (stock_state === "low_stock") {
        where.AND = [
          { available: { gt: 0 } },
          { OR: [{ minStock: null, available: { lte: settings.lowStockThreshold } }, { minStock: { not: null }, available: { lte: app.db.inventoryLevel.fields.minStock } }] },
        ];
      }
      if (stock_state === "in_stock") {
        where.AND = [
          { available: { gt: 0 } },
          { OR: [{ minStock: null, available: { gt: settings.lowStockThreshold } }, { minStock: { not: null }, available: { gt: app.db.inventoryLevel.fields.minStock } }] },
        ];
      }
      const s = parseSort(
        sort,
        { product: "variant.product.title", sku: "variant.sku", available: "available", on_hand: "available", committed: "committed", unavailable: "unavailable", incoming: "incoming", updated_at: "updatedAt" },
        { field: "variant.product.title", dir: "asc" },
      );
      const orderBy: Prisma.InventoryLevelOrderByWithRelationInput[] =
        s.field === "variant.product.title"
          ? [{ variant: { product: { title: s.dir } } }, { variant: { position: "asc" } }, { id: "asc" }]
          : s.field === "variant.sku"
            ? [{ variant: { sku: s.dir } }, { id: "asc" }]
            : [{ [s.field]: s.dir }, { id: "asc" }];
      const [rows, total] = await Promise.all([
        app.db.inventoryLevel.findMany({ where, include: { variant: { select: variantSelect }, location: { select: { id: true, name: true } } }, orderBy, ...cursorArgs(cursor, limit) }),
        cursor ? Promise.resolve(undefined) : app.db.inventoryLevel.count({ where }),
      ]);
      const page = buildPage(rows, limit, total);
      return { data: page.data.map(serializeLevel), meta: page.meta };
    },
  );

  app.get(
    "/inventory-levels/summary",
    {
      preValidation: [app.guard("inventory.read", "read:inventory")],
      schema: {
        tags: ["Inventory"],
        summary: "Conteo por estado de existencias (para pestañas)",
        querystring: z.object({ location_id: z.string().optional() }),
        response: { 200: z.object({ all: z.number().int(), in_stock: z.number().int(), low_stock: z.number().int(), out_of_stock: z.number().int() }) },
      },
    },
    async (request) => {
      const settings = await app.settings();
      const loc = request.query.location_id;
      const rows = await app.db.$queryRaw<{ state: string; n: bigint }[]>`
        SELECT CASE WHEN l.available <= 0 THEN 'out_of_stock'
                    WHEN l.available <= COALESCE(l."minStock", ${settings.lowStockThreshold}) THEN 'low_stock'
                    ELSE 'in_stock' END AS state, COUNT(*)::bigint AS n
        FROM "InventoryLevel" l JOIN "Variant" v ON v.id = l."variantId" JOIN "Product" p ON p.id = v."productId"
        WHERE p.status <> 'ARCHIVED' ${loc ? Prisma.sql`AND l."locationId" = ${loc}` : Prisma.empty}
        GROUP BY 1`;
      const out = { all: 0, in_stock: 0, low_stock: 0, out_of_stock: 0 };
      for (const r of rows) {
        const n = Number(r.n);
        out.all += n;
        if (r.state in out) out[r.state as keyof typeof out] = n;
      }
      return out;
    },
  );

  app.get(
    "/inventory-levels/:variantId/:locationId",
    {
      preValidation: [app.guard("inventory.read", "read:inventory")],
      schema: { tags: ["Inventory"], summary: "Nivel de una variante en una ubicación", params: z.object({ variantId: z.string(), locationId: z.string() }), response: { 200: inventoryLevelSchema } },
    },
    async (request) => {
      const { variantId, locationId } = request.params;
      let level = await app.db.inventoryLevel.findUnique({ where: { variantId_locationId: { variantId, locationId } }, include: { variant: { select: variantSelect }, location: { select: { id: true, name: true } } } });
      if (!level) {
        const [variant, location] = await Promise.all([app.db.variant.findUnique({ where: { id: variantId }, select: variantSelect }), app.db.location.findUnique({ where: { id: locationId }, select: { id: true, name: true } })]);
        if (!variant || !location) throw E.notFound("La variante o la ubicación");
        level = { id: `virtual:${variantId}:${locationId}`, variantId, locationId, available: 0, committed: 0, unavailable: 0, incoming: 0, minStock: null, updatedAt: new Date(), variant, location };
      }
      return serializeLevel(level);
    },
  );

  app.put(
    "/inventory-levels/min-stock",
    { preValidation: [app.guard("inventory.adjust", "write:inventory")], schema: { tags: ["Inventory"], summary: "Fijar stock mínimo por variante/ubicación", body: setMinStockBody, response: { 200: inventoryLevelSchema } } },
    async (request) => {
      const { variantId, locationId, minStock } = request.body;
      const level = await app.db.inventoryLevel.upsert({
        where: { variantId_locationId: { variantId, locationId } },
        create: { variantId, locationId, minStock },
        update: { minStock },
        include: { variant: { select: variantSelect }, location: { select: { id: true, name: true } } },
      });
      return serializeLevel(level);
    },
  );

  // ---------- Ajustes ----------
  app.post(
    "/inventory-adjustments/preview",
    {
      preValidation: [app.guard("inventory.adjust", "write:inventory")],
      schema: { tags: ["Inventory"], summary: "Vista previa de un ajuste (sin guardar)", body: adjustmentInput, response: { 200: adjustmentPreviewResponse } },
    },
    async (request) => {
      const b = request.body;
      const level = await app.db.inventoryLevel.findUnique({ where: { variantId_locationId: { variantId: b.variantId, locationId: b.locationId } } });
      const cur = level ?? { available: 0, committed: 0, unavailable: 0, incoming: 0 };
      const field = b.bucket === "UNAVAILABLE" ? "unavailable" : "available";
      const before = cur[field];
      const after = b.mode === "set" ? b.quantity : before + b.quantity;
      const onHandBefore = onHand(cur);
      return { variantId: b.variantId, locationId: b.locationId, bucket: b.bucket, before, after, delta: after - before, onHandBefore, onHandAfter: onHandBefore + (after - before) };
    },
  );

  app.post(
    "/inventory-adjustments",
    {
      preValidation: [app.guard("inventory.adjust", "write:inventory")],
      config: { idempotent: true },
      schema: {
        tags: ["Inventory"],
        summary: "Ajustar inventario (delta o set)",
        description: "`mode: \"delta\"` suma/resta `quantity` al bucket; `mode: \"set\"` deja el bucket exactamente en `quantity`. El motivo es obligatorio. Acepta `Idempotency-Key`.",
        body: adjustmentInput,
        response: { 201: z.object({ level: inventoryLevelSchema, movements: z.array(movementSchema) }) },
      },
    },
    async (request, reply) => {
      const b = request.body;
      const reason = await resolveReason(app, b.reasonId, b.reason);
      const settings = await app.settings();
      const variant = await app.db.variant.findUnique({ where: { id: b.variantId }, select: { id: true, sku: true, product: { select: { title: true } } } });
      if (!variant) throw E.notFound("La variante");
      const cmd: AdjustmentCommand = { ...b, reason, note: b.note ?? null, referenceType: "ADJUSTMENT" };
      const applied = await withTx(app.db, (tx) => applyAdjustments(tx, [cmd], request.actor!, { allowNegativeAvailable: settings.allowNegativeStock }));
      await emitInventoryEvents(app, applied, "adjustment");
      const level = await app.db.inventoryLevel.findUniqueOrThrow({ where: { variantId_locationId: { variantId: b.variantId, locationId: b.locationId } }, include: { variant: { select: variantSelect }, location: { select: { id: true, name: true } } } });
      const movements = await app.db.inventoryMovement.findMany({ where: { id: { in: applied.map((m) => m.id) } } });
      return reply.status(201).send({ level: serializeLevel(level), movements: movements.map(serializeMovement) });
    },
  );

  app.post(
    "/inventory-adjustments/bulk",
    {
      preValidation: [app.guard("inventory.adjust", "write:inventory")],
      config: { idempotent: true },
      schema: {
        tags: ["Inventory"],
        summary: "Ajuste masivo (hasta 500) en una sola transacción",
        body: bulkAdjustmentBody,
        response: { 201: z.object({ applied: z.number().int(), movements: z.array(movementSchema) }) },
      },
    },
    async (request, reply) => {
      const settings = await app.settings();
      const reasons = await app.db.reason.findMany();
      const cmds: AdjustmentCommand[] = request.body.adjustments.map((a, i) => {
        const reason = a.reasonId ? reasons.find((r) => r.id === a.reasonId)?.name : a.reason?.trim();
        if (!reason) throw E.validation(`Fila ${i + 1}: el motivo es obligatorio.`, [{ path: `adjustments.${i}.reason`, message: "Introduce un motivo." }]);
        return { ...a, reason, note: a.note ?? null, referenceType: "BULK_ADJUSTMENT" };
      });
      const variantIds = [...new Set(cmds.map((c) => c.variantId))];
      const found = await app.db.variant.count({ where: { id: { in: variantIds } } });
      if (found !== variantIds.length) throw E.validation("Alguna variante no existe.");
      const applied = await withTx(app.db, (tx) => applyAdjustments(tx, cmds, request.actor!, { allowNegativeAvailable: settings.allowNegativeStock }));
      await emitInventoryEvents(app, applied, "bulk_adjustment");
      const movements = await app.db.inventoryMovement.findMany({ where: { id: { in: applied.map((m) => m.id) } } });
      return reply.status(201).send({ applied: applied.length, movements: movements.map(serializeMovement) });
    },
  );

  app.post(
    "/inventory-adjustments/state-change",
    {
      preValidation: [app.guard("inventory.adjust", "write:inventory")],
      config: { idempotent: true },
      schema: { tags: ["Inventory"], summary: "Mover unidades entre Disponible y No disponible", body: stateChangeBody, response: { 201: z.object({ level: inventoryLevelSchema, movements: z.array(movementSchema) }) } },
    },
    async (request, reply) => {
      const b = request.body;
      const reason = await resolveReason(app, b.reasonId, b.reason);
      const settings = await app.settings();
      const applied = await withTx(app.db, (tx) => applyStateChange(tx, { ...b, reason, note: b.note ?? null }, request.actor!, { allowNegativeAvailable: settings.allowNegativeStock }));
      await emitInventoryEvents(app, applied, "state_change");
      const level = await app.db.inventoryLevel.findUniqueOrThrow({ where: { variantId_locationId: { variantId: b.variantId, locationId: b.locationId } }, include: { variant: { select: variantSelect }, location: { select: { id: true, name: true } } } });
      const movements = await app.db.inventoryMovement.findMany({ where: { id: { in: applied.map((m) => m.id) } } });
      return reply.status(201).send({ level: serializeLevel(level), movements: movements.map(serializeMovement) });
    },
  );

  // ---------- Movimientos ----------
  app.get(
    "/inventory-movements",
    { preValidation: [app.guard("inventory.read", "read:inventory")], schema: { tags: ["Inventory"], summary: "Libro mayor de movimientos", querystring: listMovementsQuery, response: { 200: paginated(movementSchema) } } },
    async (request) => {
      const where = movementsWhere(request.query);
      const expand = parseExpand(request.query.expand);
      const { cursor, limit, sort } = request.query;
      const s = parseSort(sort, { created_at: "createdAt", quantity: "quantity" }, { field: "createdAt", dir: "desc" });
      const [rows, total] = await Promise.all([
        app.db.inventoryMovement.findMany({ where, include: { variant: { select: variantSelect }, location: { select: { id: true, name: true } } }, orderBy: [{ [s.field]: s.dir }, { id: "desc" }], ...cursorArgs(cursor, limit) }),
        cursor ? Promise.resolve(undefined) : app.db.inventoryMovement.count({ where }),
      ]);
      const page = buildPage(rows, limit, total);
      void expand;
      return { data: page.data.map(serializeMovement), meta: page.meta };
    },
  );

  app.get(
    "/inventory-movements/export",
    { preValidation: [app.guard("inventory.read", "read:inventory")], schema: { tags: ["Inventory"], summary: "Exportar movimientos a CSV", querystring: listMovementsQuery.omit({ cursor: true, limit: true }), produces: ["text/csv"] } },
    async (request, reply) => {
      const where = movementsWhere(request.query);
      const rows = await app.db.inventoryMovement.findMany({ where, include: { variant: { select: variantSelect }, location: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 20000 });
      const csv = toCsv(
        ["Fecha", "Producto", "Variante", "SKU", "Ubicación", "Tipo", "Estado afectado", "Cantidad", "Disponible después", "Comprometido después", "No disponible después", "En existencia después", "Entrante después", "Motivo", "Nota", "Referencia", "Usuario"],
        rows.map((m) => [
          m.createdAt.toISOString(), m.variant.product.title, m.variant.title, m.variant.sku, m.location.name, m.type, m.bucket, m.quantity,
          m.availableAfter, m.committedAfter, m.unavailableAfter, m.availableAfter + m.committedAfter + m.unavailableAfter, m.incomingAfter,
          m.reason ?? "", m.note ?? "", m.referenceLabel ?? m.referenceId ?? "", m.actorName ?? "",
        ]),
      );
      reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="movimientos-${new Date().toISOString().slice(0, 10)}.csv"`);
      return reply.send(csv);
    },
  );

  app.get(
    "/inventory-movements/:id",
    { preValidation: [app.guard("inventory.read", "read:inventory")], schema: { tags: ["Inventory"], summary: "Movimiento por id", params: z.object({ id: z.string() }), response: { 200: movementSchema } } },
    async (request) => {
      const m = await app.db.inventoryMovement.findUnique({ where: { id: request.params.id }, include: { variant: { select: variantSelect }, location: { select: { id: true, name: true } } } });
      if (!m) throw E.notFound("El movimiento");
      return serializeMovement(m);
    },
  );
}

function movementsWhere(q: Omit<z.infer<typeof listMovementsQuery>, "cursor" | "limit">): Prisma.InventoryMovementWhereInput {
  const from = parseDateInput(q.from);
  const to = parseDateInput(q.to, true);
  return {
    ...(q.variant_id ? { variantId: q.variant_id } : {}),
    ...(q.product_id ? { variant: { productId: q.product_id } } : {}),
    ...(q.location_id ? { locationId: q.location_id } : {}),
    ...(q.type ? { type: { in: q.type.split(",").map((t) => t.trim()).filter(Boolean) } } : {}),
    ...(q.bucket ? { bucket: q.bucket } : {}),
    ...(q.reference_type ? { referenceType: q.reference_type } : {}),
    ...(q.reference_id ? { referenceId: q.reference_id } : {}),
    ...(q.actor_id ? { actorId: q.actor_id } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(q.q
      ? {
          OR: [
            { variant: { OR: [{ sku: { contains: q.q, mode: "insensitive" } }, { title: { contains: q.q, mode: "insensitive" } }, { product: { title: { contains: q.q, mode: "insensitive" } } }] } },
            { reason: { contains: q.q, mode: "insensitive" } },
            { referenceLabel: { contains: q.q, mode: "insensitive" } },
            { actorName: { contains: q.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export function serializeMovement(m: {
  id: string; variantId: string; locationId: string; type: string; bucket: string; quantity: number; availableAfter: number; committedAfter: number; unavailableAfter: number; incomingAfter: number;
  reason: string | null; note: string | null; referenceType: string | null; referenceId: string | null; referenceLabel: string | null; actorType: string; actorId: string | null; actorName: string | null; createdAt: Date;
  variant?: Parameters<typeof serializeVariantRef>[0]; location?: { id: string; name: string };
}) {
  return {
    id: m.id,
    variantId: m.variantId,
    locationId: m.locationId,
    type: m.type as "SALE",
    bucket: m.bucket as "AVAILABLE",
    quantity: m.quantity,
    availableAfter: m.availableAfter,
    committedAfter: m.committedAfter,
    unavailableAfter: m.unavailableAfter,
    incomingAfter: m.incomingAfter,
    reason: m.reason,
    note: m.note,
    referenceType: m.referenceType,
    referenceId: m.referenceId,
    referenceLabel: m.referenceLabel,
    actorType: m.actorType as "USER",
    actorId: m.actorId,
    actorName: m.actorName,
    createdAt: m.createdAt.toISOString(),
    ...(m.variant ? { variant: serializeVariantRef(m.variant) } : {}),
    ...(m.location ? { location: m.location } : {}),
  };
}
