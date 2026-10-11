import fp from "fastify-plugin";
import { Prisma } from "@prisma/client";
import { sha256 } from "../lib/crypto";
import { E, sendProblem } from "../lib/errors";
import { ownerKey } from "../lib/actor";

declare module "fastify" {
  interface FastifyContextConfig {
    /** Marca la ruta como idempotente (honra el header Idempotency-Key). */
    idempotent?: boolean;
    /** Marca la ruta para rate limit más estricto (login). */
    strictRateLimit?: boolean;
  }
  interface FastifyRequest {
    idempotencyRecordId: string | null;
  }
}

/**
 * Idempotencia por `Idempotency-Key`: si la misma clave (por actor) ya se procesó
 * con el mismo cuerpo, se devuelve la respuesta original. Si el cuerpo difiere → 422.
 * Las peticiones en curso con la misma clave reciben 409.
 */
export default fp(async (app) => {
  app.decorateRequest("idempotencyRecordId", null);

  app.addHook("preHandler", async (request, reply) => {
    if (!request.routeOptions.config.idempotent) return;
    const key = (request.headers["idempotency-key"] as string | undefined)?.trim();
    if (!key) return;
    if (key.length > 200) throw E.badRequest("Idempotency-Key demasiado larga (máx. 200 caracteres).");
    if (!request.actor) return; // la autenticación fallará después

    const owner = ownerKey(request.actor);
    const endpoint = `${request.method} ${request.routeOptions.url}`;
    const requestHash = sha256(JSON.stringify(request.body ?? null));

    try {
      const rec = await app.db.idempotencyKey.create({
        data: { key, ownerKey: owner, endpoint, requestHash, responseStatus: 0, responseBody: {} },
      });
      request.idempotencyRecordId = rec.id;
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      const existing = await app.db.idempotencyKey.findUnique({ where: { ownerKey_key: { ownerKey: owner, key } } });
      if (!existing) throw E.conflict("No se pudo procesar la Idempotency-Key. Reintenta.");
      if (existing.requestHash !== requestHash || existing.endpoint !== endpoint) throw E.idempotencyMismatch();
      if (existing.responseStatus === 0) {
        throw E.conflict("Hay otra petición en curso con la misma Idempotency-Key. Reintenta en unos segundos.");
      }
      reply.header("Idempotent-Replayed", "true");
      return sendStored(reply, existing.responseStatus, existing.responseBody);
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const recId = request.idempotencyRecordId;
    if (!recId) return payload;
    request.idempotencyRecordId = null;
    const status = reply.statusCode;
    if (status >= 200 && status < 300) {
      let body: Prisma.InputJsonValue = {};
      try {
        body = typeof payload === "string" ? (JSON.parse(payload) as Prisma.InputJsonValue) : {};
      } catch {
        body = {};
      }
      await app.db.idempotencyKey
        .update({ where: { id: recId }, data: { responseStatus: status, responseBody: body } })
        .catch(() => undefined);
    } else {
      await app.db.idempotencyKey.delete({ where: { id: recId } }).catch(() => undefined);
    }
    return payload;
  });

  // Si el handler lanza, libera la clave para que pueda reintentarse.
  app.addHook("onError", async (request) => {
    const recId = request.idempotencyRecordId;
    if (!recId) return;
    request.idempotencyRecordId = null;
    await app.db.idempotencyKey.delete({ where: { id: recId } }).catch(() => undefined);
  });
});

function sendStored(reply: import("fastify").FastifyReply, status: number, body: unknown) {
  if (status >= 400) return sendProblem(reply, status, body as Record<string, unknown>);
  return reply.status(status).send(body);
}
