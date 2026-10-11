import { z } from "zod";
import { createLocationBody, idParam, locationSchema, okResponse, updateLocationBody } from "@inventario/shared";
import type { App } from "../../app";
import { E } from "../../lib/errors";
import { audit } from "../../lib/audit";
import { iso } from "../../lib/serialize";
import { ensureLevels } from "../../services/products";

export default async function locationRoutes(app: App) {
  app.get(
    "/locations",
    {
      preValidation: [app.guard("inventory.read", "read:locations")],
      schema: { tags: ["Locations"], summary: "Listar ubicaciones", querystring: z.object({ active: z.enum(["true", "false"]).optional() }), response: { 200: z.object({ data: z.array(locationSchema) }) } },
    },
    async (request) => {
      const where = request.query.active ? { active: request.query.active === "true" } : {};
      const rows = await app.db.location.findMany({ where, orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
      return { data: iso(rows) };
    },
  );

  app.get(
    "/locations/:id",
    { preValidation: [app.guard("inventory.read", "read:locations")], schema: { tags: ["Locations"], summary: "Ubicación", params: idParam, response: { 200: locationSchema } } },
    async (request) => {
      const row = await app.db.location.findUnique({ where: { id: request.params.id } });
      if (!row) throw E.notFound("La ubicación");
      return iso(row);
    },
  );

  app.post(
    "/locations",
    { preValidation: [app.guard("settings.manage", null)], schema: { tags: ["Locations"], summary: "Crear ubicación", body: createLocationBody, response: { 201: locationSchema } } },
    async (request, reply) => {
      const count = await app.db.location.count();
      const row = await app.db.$transaction(async (tx) => {
        if (request.body.isDefault) await tx.location.updateMany({ data: { isDefault: false } });
        const loc = await tx.location.create({ data: { ...request.body, isDefault: request.body.isDefault || count === 0 } });
        const variants = await tx.variant.findMany({ select: { id: true } });
        await ensureLevels(tx, variants.map((v) => v.id), [loc.id]);
        return loc;
      });
      await audit(app.db, request.actor!, "create", "location", row.id, { after: row, ip: request.ip });
      return reply.status(201).send(iso(row));
    },
  );

  app.patch(
    "/locations/:id",
    { preValidation: [app.guard("settings.manage", null)], schema: { tags: ["Locations"], summary: "Editar ubicación", params: idParam, body: updateLocationBody, response: { 200: locationSchema } } },
    async (request) => {
      const before = await app.db.location.findUnique({ where: { id: request.params.id } });
      if (!before) throw E.notFound("La ubicación");
      if (before.isDefault && request.body.isDefault === false) throw E.validation("Debe existir una ubicación predeterminada. Marca otra como predeterminada primero.");
      if (before.isDefault && request.body.active === false) throw E.validation("No puedes desactivar la ubicación predeterminada.");
      const row = await app.db.$transaction(async (tx) => {
        if (request.body.isDefault) await tx.location.updateMany({ where: { NOT: { id: before.id } }, data: { isDefault: false } });
        return tx.location.update({ where: { id: before.id }, data: request.body });
      });
      await audit(app.db, request.actor!, "update", "location", row.id, { before, after: row, ip: request.ip });
      return iso(row);
    },
  );

  app.delete(
    "/locations/:id",
    { preValidation: [app.guard("settings.manage", null)], schema: { tags: ["Locations"], summary: "Eliminar ubicación (solo sin stock ni movimientos)", params: idParam, response: { 200: okResponse } } },
    async (request) => {
      const loc = await app.db.location.findUnique({ where: { id: request.params.id } });
      if (!loc) throw E.notFound("La ubicación");
      if (loc.isDefault) throw E.validation("No puedes eliminar la ubicación predeterminada.");
      const [stock, movements] = await Promise.all([
        app.db.inventoryLevel.aggregate({ where: { locationId: loc.id }, _sum: { available: true, committed: true, unavailable: true, incoming: true } }),
        app.db.inventoryMovement.count({ where: { locationId: loc.id } }),
      ]);
      const s = stock._sum;
      if ((s.available ?? 0) + (s.committed ?? 0) + (s.unavailable ?? 0) + (s.incoming ?? 0) !== 0) {
        throw E.conflict("La ubicación tiene existencias. Transfiere o ajusta el stock a cero antes de eliminarla.");
      }
      if (movements > 0) {
        await app.db.location.update({ where: { id: loc.id }, data: { active: false } });
        await audit(app.db, request.actor!, "deactivate", "location", loc.id, { before: loc, ip: request.ip });
        return { ok: true as const };
      }
      await app.db.location.delete({ where: { id: loc.id } });
      await audit(app.db, request.actor!, "delete", "location", loc.id, { before: loc, ip: request.ip });
      return { ok: true as const };
    },
  );
}
