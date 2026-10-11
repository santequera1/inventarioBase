import { z } from "zod";
import { createSupplierBody, idParam, okResponse, paginated, paginationQuery, supplierSchema, updateSupplierBody } from "@inventario/shared";
import type { App } from "../../app";
import { E } from "../../lib/errors";
import { buildPage, cursorArgs, parseSort } from "../../lib/pagination";
import { audit } from "../../lib/audit";
import { iso } from "../../lib/serialize";

const listQuery = paginationQuery.extend({ q: z.string().optional(), active: z.enum(["true", "false"]).optional() });

export default async function supplierRoutes(app: App) {
  app.get(
    "/suppliers",
    { preValidation: [app.guard("suppliers.read", "read:suppliers")], schema: { tags: ["Suppliers"], summary: "Listar proveedores", querystring: listQuery, response: { 200: paginated(supplierSchema) } } },
    async (request) => {
      const { q, active, cursor, limit, sort } = request.query;
      const where = {
        ...(active ? { active: active === "true" } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { nit: { contains: q } }, { contactName: { contains: q, mode: "insensitive" as const } }] } : {}),
      };
      const s = parseSort(sort, { name: "name", created_at: "createdAt", updated_at: "updatedAt" }, { field: "name", dir: "asc" });
      const [rows, total] = await Promise.all([
        app.db.supplier.findMany({ where, orderBy: [{ [s.field]: s.dir }, { id: "asc" }], ...cursorArgs(cursor, limit) }),
        cursor ? Promise.resolve(undefined) : app.db.supplier.count({ where }),
      ]);
      return iso(buildPage(rows, limit, total));
    },
  );
  app.get(
    "/suppliers/:id",
    { preValidation: [app.guard("suppliers.read", "read:suppliers")], schema: { tags: ["Suppliers"], summary: "Proveedor", params: idParam, response: { 200: supplierSchema } } },
    async (request) => {
      const row = await app.db.supplier.findUnique({ where: { id: request.params.id } });
      if (!row) throw E.notFound("El proveedor");
      return iso(row);
    },
  );
  app.post(
    "/suppliers",
    { preValidation: [app.guard("suppliers.write", "write:suppliers")], schema: { tags: ["Suppliers"], summary: "Crear proveedor", body: createSupplierBody, response: { 201: supplierSchema } } },
    async (request, reply) => {
      const row = await app.db.supplier.create({ data: { ...request.body, email: request.body.email || null } });
      await audit(app.db, request.actor!, "create", "supplier", row.id, { after: row, ip: request.ip });
      return reply.status(201).send(iso(row));
    },
  );
  app.patch(
    "/suppliers/:id",
    { preValidation: [app.guard("suppliers.write", "write:suppliers")], schema: { tags: ["Suppliers"], summary: "Editar proveedor", params: idParam, body: updateSupplierBody, response: { 200: supplierSchema } } },
    async (request) => {
      const before = await app.db.supplier.findUnique({ where: { id: request.params.id } });
      if (!before) throw E.notFound("El proveedor");
      const row = await app.db.supplier.update({ where: { id: before.id }, data: { ...request.body, email: request.body.email === "" ? null : request.body.email } });
      await audit(app.db, request.actor!, "update", "supplier", row.id, { before, after: row, ip: request.ip });
      return iso(row);
    },
  );
  app.delete(
    "/suppliers/:id",
    { preValidation: [app.guard("suppliers.write", "write:suppliers")], schema: { tags: ["Suppliers"], summary: "Eliminar proveedor", params: idParam, response: { 200: okResponse } } },
    async (request) => {
      const row = await app.db.supplier.findUnique({ where: { id: request.params.id }, include: { _count: { select: { purchaseOrders: true } } } });
      if (!row) throw E.notFound("El proveedor");
      if (row._count.purchaseOrders > 0) {
        await app.db.supplier.update({ where: { id: row.id }, data: { active: false } });
        return { ok: true as const };
      }
      await app.db.supplier.delete({ where: { id: row.id } });
      await audit(app.db, request.actor!, "delete", "supplier", row.id, { before: row, ip: request.ip });
      return { ok: true as const };
    },
  );
}
