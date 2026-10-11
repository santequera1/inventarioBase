import { applyCountBody, countSchema, createCountBody, idParam, listCountsQuery, okResponse, paginated, updateCountBody } from "@inventario/shared";
import type { App } from "../../app";
import { E } from "../../lib/errors";
import { buildPage, cursorArgs } from "../../lib/pagination";
import { withTx } from "../../lib/prisma";
import { nextNumber } from "../../lib/numbering";
import { audit } from "../../lib/audit";
import { applyAdjustments, type AdjustmentCommand } from "../../services/inventory";
import { emitInventoryEvents } from "../../services/inventory-events";
import { serializeVariantRef, variantSelect } from "./inventory";

const include = { location: { select: { id: true, name: true } }, items: { include: { variant: { select: variantSelect } } } } as const;

function serialize(c: {
  id: string; number: string; locationId: string; location: { id: string; name: string }; status: string; note: string | null; appliedAt: Date | null; createdAt: Date;
  items: { id: string; variantId: string; expected: number; counted: number; variant: Parameters<typeof serializeVariantRef>[0] }[];
}) {
  return {
    id: c.id, number: c.number, locationId: c.locationId, location: c.location, status: c.status as "OPEN", note: c.note,
    items: c.items.map((i) => ({ id: i.id, variantId: i.variantId, expected: i.expected, counted: i.counted, difference: i.counted - i.expected, variant: serializeVariantRef(i.variant) })),
    appliedAt: c.appliedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

export default async function countRoutes(app: App) {
  app.get(
    "/stock-counts",
    { preValidation: [app.guard("inventory.read", "read:inventory")], schema: { tags: ["Counts"], summary: "Listar conteos físicos", querystring: listCountsQuery, response: { 200: paginated(countSchema) } } },
    async (request) => {
      const { status, location_id, cursor, limit } = request.query;
      const where = { ...(status ? { status } : {}), ...(location_id ? { locationId: location_id } : {}) };
      const [rows, total] = await Promise.all([
        app.db.stockCount.findMany({ where, include, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...cursorArgs(cursor, limit) }),
        cursor ? Promise.resolve(undefined) : app.db.stockCount.count({ where }),
      ]);
      const page = buildPage(rows, limit, total);
      return { data: page.data.map(serialize), meta: page.meta };
    },
  );

  app.get(
    "/stock-counts/:id",
    { preValidation: [app.guard("inventory.read", "read:inventory")], schema: { tags: ["Counts"], summary: "Conteo", params: idParam, response: { 200: countSchema } } },
    async (request) => {
      const c = await app.db.stockCount.findUnique({ where: { id: request.params.id }, include });
      if (!c) throw E.notFound("El conteo");
      return serialize(c);
    },
  );

  app.post(
    "/stock-counts",
    { preValidation: [app.guard("inventory.count", "write:inventory")], config: { idempotent: true }, schema: { tags: ["Counts"], summary: "Crear conteo (toma el disponible actual como esperado)", body: createCountBody, response: { 201: countSchema } } },
    async (request, reply) => {
      const b = request.body;
      const counted = new Map<string, number>();
      for (const it of b.items) counted.set(it.variantId, it.counted);
      const levels = await app.db.inventoryLevel.findMany({ where: { locationId: b.locationId, variantId: { in: [...counted.keys()] } } });
      const expected = new Map(levels.map((l) => [l.variantId, l.available]));
      const c = await withTx(app.db, async (tx) => {
        const number = await nextNumber(tx, "count", "CT-");
        return tx.stockCount.create({
          data: {
            number, locationId: b.locationId, note: b.note ?? null, createdById: request.actor!.id,
            items: { create: [...counted.entries()].map(([variantId, n]) => ({ variantId, counted: n, expected: expected.get(variantId) ?? 0 })) },
          },
          include,
        });
      });
      await audit(app.db, request.actor!, "create", "stock_count", c.id, { after: { number: c.number }, ip: request.ip });
      return reply.status(201).send(serialize(c));
    },
  );

  app.patch(
    "/stock-counts/:id",
    { preValidation: [app.guard("inventory.count", "write:inventory")], schema: { tags: ["Counts"], summary: "Actualizar cantidades contadas (solo abierto)", params: idParam, body: updateCountBody, response: { 200: countSchema } } },
    async (request) => {
      const c = await app.db.stockCount.findUnique({ where: { id: request.params.id }, include: { items: true } });
      if (!c) throw E.notFound("El conteo");
      if (c.status !== "OPEN") throw E.conflict("Solo se pueden editar conteos abiertos.");
      await withTx(app.db, async (tx) => {
        if (request.body.note !== undefined) await tx.stockCount.update({ where: { id: c.id }, data: { note: request.body.note } });
        for (const it of request.body.items) {
          const existing = c.items.find((x) => x.variantId === it.variantId);
          if (existing) await tx.stockCountItem.update({ where: { id: existing.id }, data: { counted: it.counted } });
          else {
            const level = await tx.inventoryLevel.findUnique({ where: { variantId_locationId: { variantId: it.variantId, locationId: c.locationId } } });
            await tx.stockCountItem.create({ data: { countId: c.id, variantId: it.variantId, counted: it.counted, expected: level?.available ?? 0 } });
          }
        }
      });
      return serialize(await app.db.stockCount.findUniqueOrThrow({ where: { id: c.id }, include }));
    },
  );

  app.post(
    "/stock-counts/:id/apply",
    { preValidation: [app.guard("inventory.count", "write:inventory")], config: { idempotent: true }, schema: { tags: ["Counts"], summary: "Aplicar conteo: ajusta Disponible a lo contado", params: idParam, body: applyCountBody, response: { 200: countSchema } } },
    async (request) => {
      const settings = await app.settings();
      let reason = request.body.reason?.trim() || "Conteo físico";
      if (request.body.reasonId) {
        const r = await app.db.reason.findUnique({ where: { id: request.body.reasonId } });
        if (r) reason = r.name;
      }
      const applied = await withTx(app.db, async (tx) => {
        const c = await tx.stockCount.findUnique({ where: { id: request.params.id }, include: { items: true } });
        if (!c) throw E.notFound("El conteo");
        if (c.status !== "OPEN") throw E.conflict("Este conteo ya fue aplicado o cancelado.");
        const cmds: AdjustmentCommand[] = c.items.map((it) => ({ variantId: it.variantId, locationId: c.locationId, mode: "set", bucket: "AVAILABLE", quantity: it.counted, reason, referenceType: "COUNT", referenceId: c.id, referenceLabel: c.number }));
        const applied = await applyAdjustments(tx, cmds, request.actor!, { allowNegativeAvailable: settings.allowNegativeStock }, "COUNT");
        await tx.stockCount.update({ where: { id: c.id }, data: { status: "APPLIED", appliedAt: new Date() } });
        return applied;
      });
      await emitInventoryEvents(app, applied, "count");
      await audit(app.db, request.actor!, "apply", "stock_count", request.params.id, { after: { movements: applied.length }, ip: request.ip });
      return serialize(await app.db.stockCount.findUniqueOrThrow({ where: { id: request.params.id }, include }));
    },
  );

  app.post(
    "/stock-counts/:id/cancel",
    { preValidation: [app.guard("inventory.count", "write:inventory")], schema: { tags: ["Counts"], summary: "Cancelar conteo abierto", params: idParam, response: { 200: okResponse } } },
    async (request) => {
      const c = await app.db.stockCount.findUnique({ where: { id: request.params.id } });
      if (!c) throw E.notFound("El conteo");
      if (c.status !== "OPEN") throw E.conflict("Solo se pueden cancelar conteos abiertos.");
      await app.db.stockCount.update({ where: { id: c.id }, data: { status: "CANCELLED" } });
      return { ok: true as const };
    },
  );
}
