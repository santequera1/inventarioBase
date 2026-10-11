import { z } from "zod";
import { createSavedViewBody, idParam, okResponse, savedViewSchema, updateSavedViewBody } from "@inventario/shared";
import type { App } from "../../app";
import { E } from "../../lib/errors";

export default async function savedViewRoutes(app: App) {
  app.get(
    "/saved-views",
    { preValidation: [app.requireUser], schema: { tags: ["Settings"], summary: "Vistas guardadas del usuario", querystring: z.object({ resource: z.string().optional() }), response: { 200: z.object({ data: z.array(savedViewSchema) }) } } },
    async (request) => {
      const rows = await app.db.savedView.findMany({ where: { userId: request.actor!.id!, ...(request.query.resource ? { resource: request.query.resource } : {}) }, orderBy: { position: "asc" } });
      return { data: rows.map((r) => ({ ...r, filters: r.filters as Record<string, unknown> })) };
    },
  );
  app.post(
    "/saved-views",
    { preValidation: [app.requireUser], schema: { tags: ["Settings"], summary: "Crear vista guardada", body: createSavedViewBody, response: { 201: savedViewSchema } } },
    async (request, reply) => {
      const max = await app.db.savedView.aggregate({ where: { userId: request.actor!.id!, resource: request.body.resource }, _max: { position: true } });
      const r = await app.db.savedView.create({ data: { userId: request.actor!.id!, resource: request.body.resource, name: request.body.name.trim(), filters: request.body.filters as object, position: (max._max.position ?? 0) + 1 } });
      return reply.status(201).send({ ...r, filters: r.filters as Record<string, unknown> });
    },
  );
  app.patch(
    "/saved-views/:id",
    { preValidation: [app.requireUser], schema: { tags: ["Settings"], summary: "Editar vista guardada", params: idParam, body: updateSavedViewBody, response: { 200: savedViewSchema } } },
    async (request) => {
      const v = await app.db.savedView.findUnique({ where: { id: request.params.id } });
      if (!v || v.userId !== request.actor!.id) throw E.notFound("La vista");
      const r = await app.db.savedView.update({ where: { id: v.id }, data: { ...(request.body.name ? { name: request.body.name.trim() } : {}), ...(request.body.filters ? { filters: request.body.filters as object } : {}) } });
      return { ...r, filters: r.filters as Record<string, unknown> };
    },
  );
  app.delete(
    "/saved-views/:id",
    { preValidation: [app.requireUser], schema: { tags: ["Settings"], summary: "Eliminar vista guardada", params: idParam, response: { 200: okResponse } } },
    async (request) => {
      const v = await app.db.savedView.findUnique({ where: { id: request.params.id } });
      if (!v || v.userId !== request.actor!.id) throw E.notFound("La vista");
      await app.db.savedView.delete({ where: { id: v.id } });
      return { ok: true as const };
    },
  );
}
