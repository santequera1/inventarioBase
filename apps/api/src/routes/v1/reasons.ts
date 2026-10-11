import { z } from "zod";
import { createReasonBody, idParam, okResponse, reasonSchema, updateReasonBody } from "@inventario/shared";
import type { App } from "../../app";
import { E } from "../../lib/errors";

export default async function reasonRoutes(app: App) {
  app.get(
    "/reasons",
    { preValidation: [app.guard("inventory.read", "read:inventory")], schema: { tags: ["Inventory"], summary: "Motivos de ajuste", querystring: z.object({ kind: z.string().optional(), active: z.enum(["true", "false"]).optional() }), response: { 200: z.object({ data: z.array(reasonSchema) }) } } },
    async (request) => {
      const where = { ...(request.query.kind ? { kind: request.query.kind } : {}), ...(request.query.active ? { active: request.query.active === "true" } : {}) };
      const rows = await app.db.reason.findMany({ where, orderBy: [{ position: "asc" }, { name: "asc" }] });
      return { data: rows.map((r) => ({ ...r, kind: r.kind as "ADJUSTMENT" | "UNAVAILABLE" | "RETURN" })) };
    },
  );
  app.post(
    "/reasons",
    { preValidation: [app.guard("settings.manage", null)], schema: { tags: ["Inventory"], summary: "Crear motivo", body: createReasonBody, response: { 201: reasonSchema } } },
    async (request, reply) => {
      const max = await app.db.reason.aggregate({ _max: { position: true } });
      const row = await app.db.reason.create({ data: { ...request.body, position: (max._max.position ?? 0) + 1 } });
      return reply.status(201).send({ ...row, kind: row.kind as "ADJUSTMENT" });
    },
  );
  app.patch(
    "/reasons/:id",
    { preValidation: [app.guard("settings.manage", null)], schema: { tags: ["Inventory"], summary: "Editar motivo", params: idParam, body: updateReasonBody, response: { 200: reasonSchema } } },
    async (request) => {
      const row = await app.db.reason.update({ where: { id: request.params.id }, data: request.body });
      return { ...row, kind: row.kind as "ADJUSTMENT" };
    },
  );
  app.delete(
    "/reasons/:id",
    { preValidation: [app.guard("settings.manage", null)], schema: { tags: ["Inventory"], summary: "Eliminar motivo", params: idParam, response: { 200: okResponse } } },
    async (request) => {
      const row = await app.db.reason.findUnique({ where: { id: request.params.id } });
      if (!row) throw E.notFound("El motivo");
      await app.db.reason.delete({ where: { id: row.id } });
      return { ok: true as const };
    },
  );
}
