import { z } from "zod";
import { createCustomerBody, customerSchema, idParam, listCustomersQuery, okResponse, orderSchema, paginated, updateCustomerBody } from "@inventario/shared";
import type { App } from "../../app";
import { E } from "../../lib/errors";
import { buildPage, cursorArgs, parseSort } from "../../lib/pagination";
import { audit } from "../../lib/audit";
import { iso, type Serialized } from "../../lib/serialize";
import type { Customer } from "@prisma/client";

const cust = (c: Customer) => ({ ...iso(c), documentType: c.documentType as "CC" | null });
const custPage = (p: { data: Customer[]; meta: Serialized<{ next_cursor: string | null; has_more: boolean; limit: number; total?: number }> }) => ({ data: p.data.map(cust), meta: p.meta });
import { orderInclude, serializeOrder } from "../../services/orders";

export default async function customerRoutes(app: App) {
  app.get(
    "/customers",
    { preValidation: [app.guard("customers.read", "read:customers")], schema: { tags: ["Customers"], summary: "Listar clientes", querystring: listCustomersQuery, response: { 200: paginated(customerSchema) } } },
    async (request) => {
      const { q, updated_since, cursor, limit, sort } = request.query;
      const where = {
        ...(updated_since ? { updatedAt: { gte: new Date(updated_since) } } : {}),
        ...(q ? { OR: [{ firstName: { contains: q, mode: "insensitive" as const } }, { lastName: { contains: q, mode: "insensitive" as const } }, { companyName: { contains: q, mode: "insensitive" as const } }, { documentNumber: { contains: q } }, { email: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }] } : {}),
      };
      const s = parseSort(sort, { name: "firstName", created_at: "createdAt", updated_at: "updatedAt", total_spent: "totalSpent", orders_count: "ordersCount", last_order_at: "lastOrderAt" }, { field: "updatedAt", dir: "desc" });
      const [rows, total] = await Promise.all([
        app.db.customer.findMany({ where, orderBy: [{ [s.field]: s.dir }, { id: "asc" }], ...cursorArgs(cursor, limit) }),
        cursor ? Promise.resolve(undefined) : app.db.customer.count({ where }),
      ]);
      return custPage(buildPage(rows, limit, total));
    },
  );
  app.get(
    "/customers/:id",
    { preValidation: [app.guard("customers.read", "read:customers")], schema: { tags: ["Customers"], summary: "Cliente", params: idParam, response: { 200: customerSchema } } },
    async (request) => {
      const row = await app.db.customer.findUnique({ where: { id: request.params.id } });
      if (!row) throw E.notFound("El cliente");
      return cust(row);
    },
  );
  app.get(
    "/customers/:id/orders",
    { preValidation: [app.guard("orders.read", "read:orders")], schema: { tags: ["Customers"], summary: "Órdenes del cliente", params: idParam, querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }), response: { 200: z.object({ data: z.array(orderSchema) }) } } },
    async (request) => {
      const rows = await app.db.order.findMany({ where: { customerId: request.params.id }, include: orderInclude, orderBy: { createdAt: "desc" }, take: request.query.limit });
      return { data: rows.map((o) => serializeOrder(o)) };
    },
  );
  app.post(
    "/customers",
    { preValidation: [app.guard("customers.write", "write:customers")], config: { idempotent: true }, schema: { tags: ["Customers"], summary: "Crear cliente", body: createCustomerBody, response: { 201: customerSchema } } },
    async (request, reply) => {
      const b = request.body;
      if (b.documentNumber) {
        const dup = await app.db.customer.findFirst({ where: { documentNumber: b.documentNumber.trim() } });
        if (dup) throw E.validation(`Ya existe un cliente con el documento ${b.documentNumber}.`, [{ path: "documentNumber", message: "Ya existe un cliente con este documento." }]);
      }
      const row = await app.db.customer.create({ data: { ...b, documentNumber: b.documentNumber?.trim() || null, email: b.email || null, tags: b.tags ?? [] } });
      await audit(app.db, request.actor!, "create", "customer", row.id, { after: { name: row.firstName }, ip: request.ip });
      return reply.status(201).send(cust(row));
    },
  );
  app.patch(
    "/customers/:id",
    { preValidation: [app.guard("customers.write", "write:customers")], schema: { tags: ["Customers"], summary: "Editar cliente", params: idParam, body: updateCustomerBody, response: { 200: customerSchema } } },
    async (request) => {
      const before = await app.db.customer.findUnique({ where: { id: request.params.id } });
      if (!before) throw E.notFound("El cliente");
      const b = request.body;
      const row = await app.db.customer.update({ where: { id: before.id }, data: { ...b, documentNumber: b.documentNumber === undefined ? undefined : b.documentNumber?.trim() || null, email: b.email === "" ? null : b.email } });
      await audit(app.db, request.actor!, "update", "customer", row.id, { before: { name: before.firstName, phone: before.phone }, after: { name: row.firstName, phone: row.phone }, ip: request.ip });
      return cust(row);
    },
  );
  app.delete(
    "/customers/:id",
    { preValidation: [app.guard("customers.write", "write:customers")], schema: { tags: ["Customers"], summary: "Eliminar cliente (las órdenes quedan sin cliente)", params: idParam, response: { 200: okResponse } } },
    async (request) => {
      const row = await app.db.customer.findUnique({ where: { id: request.params.id } });
      if (!row) throw E.notFound("El cliente");
      await app.db.customer.delete({ where: { id: row.id } });
      await audit(app.db, request.actor!, "delete", "customer", row.id, { before: { name: row.firstName }, ip: request.ip });
      return { ok: true as const };
    },
  );
}
