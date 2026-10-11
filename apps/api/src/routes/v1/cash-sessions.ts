import { z } from "zod";
import { cashMovementBody, cashSessionSchema, closeCashSessionBody, idParam, listCashSessionsQuery, openCashSessionBody, paginated } from "@inventario/shared";
import type { App } from "../../app";
import { E } from "../../lib/errors";
import { buildPage, cursorArgs } from "../../lib/pagination";
import { audit } from "../../lib/audit";

async function serialize(app: App, s: {
  id: string; locationId: string; location?: { id: string; name: string }; status: string; openedById: string; openedByName: string | null; closedByName: string | null; openingAmount: number; expectedAmount: number | null; closingAmount: number | null; difference: number | null; note: string | null; openedAt: Date; closedAt: Date | null;
}) {
  const [payments, movements, orders, methods] = await Promise.all([
    app.db.orderPayment.findMany({ where: { cashSessionId: s.id } }),
    app.db.cashMovement.findMany({ where: { sessionId: s.id } }),
    app.db.order.aggregate({ where: { cashSessionId: s.id, status: { not: "CANCELLED" } }, _count: true, _sum: { total: true } }),
    app.db.paymentMethod.findMany(),
  ]);
  const cashCodes = new Set(methods.filter((m) => m.type === "CASH").map((m) => m.code));
  const cashSales = payments.filter((p) => p.kind === "PAYMENT" && cashCodes.has(p.methodCode)).reduce((a, p) => a + p.amount, 0);
  const cashRefunds = payments.filter((p) => p.kind === "REFUND" && cashCodes.has(p.methodCode)).reduce((a, p) => a + p.amount, 0);
  const cashIn = movements.filter((m) => m.type === "IN").reduce((a, m) => a + m.amount, 0);
  const cashOut = movements.filter((m) => m.type === "OUT").reduce((a, m) => a + m.amount, 0);
  const byMethodMap = new Map<string, { methodCode: string; methodName: string; total: number }>();
  for (const p of payments) {
    const cur = byMethodMap.get(p.methodCode) ?? { methodCode: p.methodCode, methodName: p.methodName, total: 0 };
    cur.total += p.kind === "PAYMENT" ? p.amount : -p.amount;
    byMethodMap.set(p.methodCode, cur);
  }
  const expected = s.openingAmount + cashSales - cashRefunds + cashIn - cashOut;
  return {
    id: s.id, locationId: s.locationId, location: s.location, status: s.status as "OPEN", openedById: s.openedById, openedByName: s.openedByName, closedByName: s.closedByName,
    openingAmount: s.openingAmount, expectedAmount: s.status === "OPEN" ? expected : s.expectedAmount, closingAmount: s.closingAmount, difference: s.difference,
    cashSales, cashRefunds, cashIn, cashOut, ordersCount: orders._count, salesTotal: orders._sum.total ?? 0, byMethod: [...byMethodMap.values()],
    note: s.note, openedAt: s.openedAt.toISOString(), closedAt: s.closedAt?.toISOString() ?? null,
  };
}
const include = { location: { select: { id: true, name: true } } } as const;

export default async function cashRoutes(app: App) {
  app.get(
    "/cash-sessions",
    { preValidation: [app.guard("cash.manage", "read:orders")], schema: { tags: ["Cash"], summary: "Listar sesiones de caja", querystring: listCashSessionsQuery, response: { 200: paginated(cashSessionSchema) } } },
    async (request) => {
      const { location_id, status, cursor, limit } = request.query;
      const where = { ...(location_id ? { locationId: location_id } : {}), ...(status ? { status } : {}) };
      const [rows, total] = await Promise.all([
        app.db.cashSession.findMany({ where, include, orderBy: [{ openedAt: "desc" }, { id: "desc" }], ...cursorArgs(cursor, limit) }),
        cursor ? Promise.resolve(undefined) : app.db.cashSession.count({ where }),
      ]);
      const page = buildPage(rows, limit, total);
      return { data: await Promise.all(page.data.map((s) => serialize(app, s))), meta: page.meta };
    },
  );
  app.get(
    "/cash-sessions/current",
    { preValidation: [app.guard("pos.use", "read:orders")], schema: { tags: ["Cash"], summary: "Sesión abierta en una ubicación (o null)", querystring: z.object({ location_id: z.string() }), response: { 200: z.object({ session: cashSessionSchema.nullable() }) } } },
    async (request) => {
      const s = await app.db.cashSession.findFirst({ where: { locationId: request.query.location_id, status: "OPEN" }, include, orderBy: { openedAt: "desc" } });
      return { session: s ? await serialize(app, s) : null };
    },
  );
  app.get(
    "/cash-sessions/:id",
    { preValidation: [app.guard("cash.manage", "read:orders")], schema: { tags: ["Cash"], summary: "Sesión de caja", params: idParam, response: { 200: cashSessionSchema } } },
    async (request) => {
      const s = await app.db.cashSession.findUnique({ where: { id: request.params.id }, include });
      if (!s) throw E.notFound("La sesión de caja");
      return serialize(app, s);
    },
  );
  app.post(
    "/cash-sessions",
    { preValidation: [app.guard("cash.manage", null)], schema: { tags: ["Cash"], summary: "Abrir caja", body: openCashSessionBody, response: { 201: cashSessionSchema } } },
    async (request, reply) => {
      const open = await app.db.cashSession.findFirst({ where: { locationId: request.body.locationId, status: "OPEN" } });
      if (open) throw E.conflict("Ya hay una caja abierta en esta ubicación. Ciérrala antes de abrir otra.");
      const s = await app.db.cashSession.create({ data: { locationId: request.body.locationId, openedById: request.actor!.id!, openedByName: request.actor!.name, openingAmount: request.body.openingAmount, note: request.body.note ?? null }, include });
      await audit(app.db, request.actor!, "open", "cash_session", s.id, { after: { openingAmount: s.openingAmount }, ip: request.ip });
      return reply.status(201).send(await serialize(app, s));
    },
  );
  app.post(
    "/cash-sessions/:id/movements",
    { preValidation: [app.guard("cash.manage", null)], schema: { tags: ["Cash"], summary: "Entrada o salida de efectivo", params: idParam, body: cashMovementBody, response: { 200: cashSessionSchema } } },
    async (request) => {
      const s = await app.db.cashSession.findUnique({ where: { id: request.params.id }, include });
      if (!s) throw E.notFound("La sesión de caja");
      if (s.status !== "OPEN") throw E.conflict("La caja está cerrada.");
      await app.db.cashMovement.create({ data: { sessionId: s.id, ...request.body, actorName: request.actor!.name } });
      return serialize(app, s);
    },
  );
  app.post(
    "/cash-sessions/:id/close",
    { preValidation: [app.guard("cash.manage", null)], schema: { tags: ["Cash"], summary: "Cerrar caja con arqueo", params: idParam, body: closeCashSessionBody, response: { 200: cashSessionSchema } } },
    async (request) => {
      const s = await app.db.cashSession.findUnique({ where: { id: request.params.id }, include });
      if (!s) throw E.notFound("La sesión de caja");
      if (s.status !== "OPEN") throw E.conflict("La caja ya está cerrada.");
      const current = await serialize(app, s);
      const expected = current.expectedAmount ?? s.openingAmount;
      const closed = await app.db.cashSession.update({
        where: { id: s.id },
        data: { status: "CLOSED", closedAt: new Date(), closedById: request.actor!.id, closedByName: request.actor!.name, expectedAmount: expected, closingAmount: request.body.closingAmount, difference: request.body.closingAmount - expected, note: request.body.note ?? s.note },
        include,
      });
      await audit(app.db, request.actor!, "close", "cash_session", s.id, { after: { expected, closing: request.body.closingAmount, difference: closed.difference }, ip: request.ip });
      return serialize(app, closed);
    },
  );
}
