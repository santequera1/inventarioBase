import { auditLogSchema, listAuditQuery, paginated } from "@inventario/shared";
import type { App } from "../../app";
import { buildPage, cursorArgs } from "../../lib/pagination";
import { parseDateInput } from "../../lib/dates";

export default async function auditRoutes(app: App) {
  app.get(
    "/audit-logs",
    { preValidation: [app.guard("audit.read", null)], schema: { tags: ["Settings"], summary: "Auditoría de acciones", querystring: listAuditQuery, response: { 200: paginated(auditLogSchema) } } },
    async (request) => {
      const { entity, entity_id, actor_id, action, from, to, cursor, limit } = request.query;
      const f = parseDateInput(from);
      const t = parseDateInput(to, true);
      const where = { ...(entity ? { entity } : {}), ...(entity_id ? { entityId: entity_id } : {}), ...(actor_id ? { actorId: actor_id } : {}), ...(action ? { action } : {}), ...(f || t ? { createdAt: { ...(f ? { gte: f } : {}), ...(t ? { lte: t } : {}) } } : {}) };
      const [rows, total] = await Promise.all([
        app.db.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...cursorArgs(cursor, limit) }),
        cursor ? Promise.resolve(undefined) : app.db.auditLog.count({ where }),
      ]);
      const page = buildPage(rows, limit, total);
      return { data: page.data.map((r) => ({ ...r, actorType: r.actorType as "USER", createdAt: r.createdAt.toISOString() })), meta: page.meta };
    },
  );
}
