import { z } from "zod";
import { createPaymentMethodBody, idParam, okResponse, paymentMethodSchema, updatePaymentMethodBody } from "@inventario/shared";
import type { App } from "../../app";
import { E } from "../../lib/errors";

const cast = <T extends { type: string }>(r: T) => ({ ...r, type: r.type as "CASH" | "CARD" | "TRANSFER" | "WALLET" | "OTHER" });

export default async function paymentMethodRoutes(app: App) {
  app.get(
    "/payment-methods",
    { preValidation: [app.guard("orders.read", "read:orders")], schema: { tags: ["Orders"], summary: "Métodos de pago", querystring: z.object({ active: z.enum(["true", "false"]).optional() }), response: { 200: z.object({ data: z.array(paymentMethodSchema) }) } } },
    async (request) => {
      const rows = await app.db.paymentMethod.findMany({ where: request.query.active ? { active: request.query.active === "true" } : {}, orderBy: { position: "asc" } });
      return { data: rows.map(cast) };
    },
  );
  app.post(
    "/payment-methods",
    { preValidation: [app.guard("settings.manage", null)], schema: { tags: ["Orders"], summary: "Crear método de pago", body: createPaymentMethodBody, response: { 201: paymentMethodSchema } } },
    async (request, reply) => {
      const max = await app.db.paymentMethod.aggregate({ _max: { position: true } });
      const row = await app.db.paymentMethod.create({ data: { ...request.body, position: (max._max.position ?? 0) + 1 } });
      return reply.status(201).send(cast(row));
    },
  );
  app.patch(
    "/payment-methods/:id",
    { preValidation: [app.guard("settings.manage", null)], schema: { tags: ["Orders"], summary: "Editar método de pago", params: idParam, body: updatePaymentMethodBody, response: { 200: paymentMethodSchema } } },
    async (request) => cast(await app.db.paymentMethod.update({ where: { id: request.params.id }, data: request.body })),
  );
  app.delete(
    "/payment-methods/:id",
    { preValidation: [app.guard("settings.manage", null)], schema: { tags: ["Orders"], summary: "Eliminar método de pago", params: idParam, response: { 200: okResponse } } },
    async (request) => {
      const row = await app.db.paymentMethod.findUnique({ where: { id: request.params.id } });
      if (!row) throw E.notFound("El método de pago");
      const used = await app.db.orderPayment.count({ where: { methodCode: row.code } });
      if (used > 0) await app.db.paymentMethod.update({ where: { id: row.id }, data: { active: false } });
      else await app.db.paymentMethod.delete({ where: { id: row.id } });
      return { ok: true as const };
    },
  );
}
