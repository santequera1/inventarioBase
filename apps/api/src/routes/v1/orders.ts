import { z } from "zod";
import { addOrderNoteBody, addPaymentBody, cancelOrderBody, createOrderBody, idParam, listOrdersQuery, orderSchema, paginated, returnOrderBody } from "@inventario/shared";
import type { App } from "../../app";
import { E } from "../../lib/errors";
import { buildPage, cursorArgs, parseSort } from "../../lib/pagination";
import { withTx, type Prisma } from "../../lib/prisma";
import { parseDateInput } from "../../lib/dates";
import { audit } from "../../lib/audit";
import { addPayments, cancelOrder, createOrder, fulfillOrder, orderInclude, returnOrder, serializeOrder } from "../../services/orders";
import { emitInventoryEvents } from "../../services/inventory-events";
import { toCsv } from "../../lib/csv";

function ordersWhere(q: Omit<z.infer<typeof listOrdersQuery>, "cursor" | "limit">): Prisma.OrderWhereInput {
  const from = parseDateInput(q.from);
  const to = parseDateInput(q.to, true);
  return {
    ...(q.status ? { status: q.status } : {}),
    ...(q.payment_status ? { paymentStatus: q.payment_status } : {}),
    ...(q.fulfillment_status ? { fulfillmentStatus: q.fulfillment_status } : {}),
    ...(q.location_id ? { locationId: q.location_id } : {}),
    ...(q.customer_id ? { customerId: q.customer_id } : {}),
    ...(q.source ? { source: q.source } : {}),
    ...(q.updated_since ? { updatedAt: { gte: new Date(q.updated_since) } } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(q.q
      ? {
          OR: [
            { number: { contains: q.q, mode: "insensitive" } },
            { externalRef: { contains: q.q, mode: "insensitive" } },
            { customer: { OR: [{ firstName: { contains: q.q, mode: "insensitive" } }, { lastName: { contains: q.q, mode: "insensitive" } }, { documentNumber: { contains: q.q } }] } },
            { items: { some: { OR: [{ sku: { contains: q.q, mode: "insensitive" } }, { productTitle: { contains: q.q, mode: "insensitive" } }] } } },
          ],
        }
      : {}),
  };
}

export default async function orderRoutes(app: App) {
  app.get(
    "/orders",
    { preValidation: [app.guard("orders.read", "read:orders")], schema: { tags: ["Orders"], summary: "Listar órdenes", querystring: listOrdersQuery, response: { 200: paginated(orderSchema) } } },
    async (request) => {
      const where = ordersWhere(request.query);
      const { cursor, limit, sort } = request.query;
      const s = parseSort(sort, { created_at: "createdAt", updated_at: "updatedAt", total: "total", number: "sequence" }, { field: "createdAt", dir: "desc" });
      const [rows, total] = await Promise.all([
        app.db.order.findMany({ where, include: { ...orderInclude, events: false }, orderBy: [{ [s.field]: s.dir }, { id: "desc" }], ...cursorArgs(cursor, limit) }),
        cursor ? Promise.resolve(undefined) : app.db.order.count({ where }),
      ]);
      const page = buildPage(rows, limit, total);
      return { data: page.data.map((o) => serializeOrder({ ...o, events: undefined })), meta: page.meta };
    },
  );

  app.get(
    "/orders/export",
    { preValidation: [app.guard("orders.read", "read:orders")], schema: { tags: ["Orders"], summary: "Exportar órdenes a CSV", querystring: listOrdersQuery.omit({ cursor: true, limit: true }), produces: ["text/csv"] } },
    async (request, reply) => {
      const rows = await app.db.order.findMany({ where: ordersWhere(request.query), include: { location: true, customer: true, items: true, payments: true }, orderBy: { createdAt: "desc" }, take: 20000 });
      const csv = toCsv(
        ["Número", "Fecha", "Estado", "Pago", "Entrega", "Origen", "Ubicación", "Cliente", "Documento", "Artículos", "Subtotal", "Descuento", "IVA", "Total", "Pagado", "Reembolsado", "Métodos", "Vendedor"],
        rows.map((o) => [
          o.number, o.createdAt.toISOString(), o.status, o.paymentStatus, o.fulfillmentStatus, o.source, o.location.name,
          o.customer ? `${o.customer.firstName} ${o.customer.lastName ?? ""}`.trim() : "", o.customer?.documentNumber ?? "",
          o.items.reduce((a, i) => a + i.quantity, 0), o.subtotal, o.discountTotal, o.taxTotal, o.total, o.paidTotal, o.refundedTotal,
          [...new Set(o.payments.filter((p) => p.kind === "PAYMENT").map((p) => p.methodName))].join(", "), o.createdByName ?? "",
        ]),
      );
      reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="ordenes-${new Date().toISOString().slice(0, 10)}.csv"`);
      return reply.send(csv);
    },
  );

  app.get(
    "/orders/:id",
    { preValidation: [app.guard("orders.read", "read:orders")], schema: { tags: ["Orders"], summary: "Orden con líneas, pagos y línea de tiempo", params: idParam, response: { 200: orderSchema } } },
    async (request) => {
      const o = await app.db.order.findUnique({ where: { id: request.params.id }, include: orderInclude });
      if (!o) throw E.notFound("La orden");
      return serializeOrder(o);
    },
  );

  app.post(
    "/orders",
    {
      preValidation: [app.guard("orders.write", "write:orders")],
      config: { idempotent: true },
      schema: {
        tags: ["Orders"],
        summary: "Crear orden / venta",
        description: "Descuenta stock (o lo compromete con `hold: true`), registra pagos combinables y calcula IVA por línea. Envía `Idempotency-Key` para evitar ventas duplicadas al reintentar.",
        body: createOrderBody,
        response: { 201: orderSchema },
      },
    },
    async (request, reply) => {
      const settings = await app.settings();
      const actor = request.actor!;
      const body = { ...request.body, source: actor.type === "API_KEY" ? ("API" as const) : request.body.source };
      const { order, applied } = await withTx(app.db, (tx) => createOrder(tx, body, actor, settings));
      await emitInventoryEvents(app, applied, "order");
      const out = serializeOrder(order);
      void app.webhooks.emit("order.created", out);
      if (order.paymentStatus === "PAID") void app.webhooks.emit("order.paid", out);
      await audit(app.db, actor, "create", "order", order.id, { after: { number: order.number, total: order.total }, ip: request.ip });
      return reply.status(201).send(out);
    },
  );

  app.post(
    "/orders/:id/payments",
    { preValidation: [app.guard("orders.write", "write:orders")], config: { idempotent: true }, schema: { tags: ["Orders"], summary: "Registrar pagos adicionales", params: idParam, body: addPaymentBody, response: { 200: orderSchema } } },
    async (request) => {
      const paid = await withTx(app.db, (tx) => addPayments(tx, request.params.id, request.actor!, request.body.payments));
      const o = await app.db.order.findUniqueOrThrow({ where: { id: request.params.id }, include: orderInclude });
      const out = serializeOrder(o);
      if (paid) void app.webhooks.emit("order.paid", out);
      return out;
    },
  );

  app.post(
    "/orders/:id/fulfill",
    { preValidation: [app.guard("orders.write", "write:orders")], config: { idempotent: true }, schema: { tags: ["Orders"], summary: "Entregar orden abierta (comprometido → vendido)", params: idParam, response: { 200: orderSchema } } },
    async (request) => {
      const applied = await withTx(app.db, (tx) => fulfillOrder(tx, request.params.id, request.actor!));
      await emitInventoryEvents(app, applied, "order");
      await audit(app.db, request.actor!, "fulfill", "order", request.params.id, { ip: request.ip });
      return serializeOrder(await app.db.order.findUniqueOrThrow({ where: { id: request.params.id }, include: orderInclude }));
    },
  );

  app.post(
    "/orders/:id/cancel",
    { preValidation: [app.guard("orders.refund", "write:orders")], config: { idempotent: true }, schema: { tags: ["Orders"], summary: "Anular orden (reingresa stock y reembolsa)", params: idParam, body: cancelOrderBody, response: { 200: orderSchema } } },
    async (request) => {
      const applied = await withTx(app.db, (tx) => cancelOrder(tx, request.params.id, request.actor!, request.body));
      await emitInventoryEvents(app, applied, "order");
      const o = await app.db.order.findUniqueOrThrow({ where: { id: request.params.id }, include: orderInclude });
      const out = serializeOrder(o);
      void app.webhooks.emit("order.cancelled", out);
      await audit(app.db, request.actor!, "cancel", "order", o.id, { after: { reason: request.body.reason }, ip: request.ip });
      return out;
    },
  );

  app.post(
    "/orders/:id/returns",
    { preValidation: [app.guard("orders.refund", "write:orders")], config: { idempotent: true }, schema: { tags: ["Orders"], summary: "Registrar devolución (parcial o total)", params: idParam, body: returnOrderBody, response: { 200: orderSchema } } },
    async (request) => {
      const { applied, refundAmount } = await withTx(app.db, (tx) => returnOrder(tx, request.params.id, request.actor!, request.body));
      await emitInventoryEvents(app, applied, "return");
      const o = await app.db.order.findUniqueOrThrow({ where: { id: request.params.id }, include: orderInclude });
      const out = serializeOrder(o);
      void app.webhooks.emit("order.returned", { ...out, refund_amount: refundAmount });
      await audit(app.db, request.actor!, "return", "order", o.id, { after: { reason: request.body.reason, refundAmount }, ip: request.ip });
      return out;
    },
  );

  app.post(
    "/orders/:id/notes",
    { preValidation: [app.guard("orders.write", "write:orders")], schema: { tags: ["Orders"], summary: "Añadir nota a la línea de tiempo", params: idParam, body: addOrderNoteBody, response: { 200: orderSchema } } },
    async (request) => {
      await app.db.orderEvent.create({ data: { orderId: request.params.id, type: "note", message: request.body.message, actorName: request.actor!.name } });
      return serializeOrder(await app.db.order.findUniqueOrThrow({ where: { id: request.params.id }, include: orderInclude }));
    },
  );
}
