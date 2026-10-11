import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import type { ApiScope, Permission } from "@inventario/shared";
import { SESSION_COOKIE, SESSION_TTL_MS } from "../config";
import { parseApiKeyPrefix, safeEqualHex, sha256 } from "../lib/crypto";
import { E } from "../lib/errors";
import type { Actor } from "../lib/actor";

declare module "fastify" {
  interface FastifyRequest {
    actor: Actor | null;
    sessionId: string | null;
  }
  interface FastifyInstance {
    /** Exige actor autenticado con el permiso (sesión) o el scope (API key). `scope: null` = solo sesión. */
    guard: (permission: Permission | null, scope?: ApiScope | null) => preHandlerHookHandler;
    requireUser: preHandlerHookHandler;
    setSessionCookie: (reply: FastifyReply, sessionId: string) => void;
    clearSessionCookie: (reply: FastifyReply) => void;
  }
}

export default fp(async (app) => {
  app.decorateRequest("actor", null);
  app.decorateRequest("sessionId", null);

  app.decorate("setSessionCookie", (reply: FastifyReply, sessionId: string) => {
    reply.setCookie(SESSION_COOKIE, sessionId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: app.config.isProd,
      signed: true,
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
  });
  app.decorate("clearSessionCookie", (reply: FastifyReply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
  });

  // Resuelve el actor en cada petición (sin exigirlo).
  app.addHook("onRequest", async (request) => {
    const authHeader = request.headers.authorization;
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
    const headerKey = (request.headers["x-api-key"] as string | undefined)?.trim();
    const token = bearer ?? headerKey;

    if (token) {
      const prefix = parseApiKeyPrefix(token);
      if (!prefix) throw E.unauthorized("La API key tiene un formato inválido.");
      const key = await app.db.apiKey.findUnique({ where: { prefix } });
      if (!key || !safeEqualHex(key.hash, sha256(token))) throw E.unauthorized("API key inválida.");
      if (key.revokedAt) throw E.unauthorized("Esta API key fue revocada.");
      if (key.expiresAt && key.expiresAt < new Date()) throw E.unauthorized("Esta API key expiró.");
      request.actor = { type: "API_KEY", id: key.id, name: key.name, scopes: key.scopes as ApiScope[] };
      // Actualiza "último uso" como máximo una vez por minuto para no saturar escrituras.
      if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
        app.db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
      }
      return;
    }

    const raw = request.cookies[SESSION_COOKIE];
    if (!raw) return;
    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return;
    const session = await app.db.session.findUnique({
      where: { id: unsigned.value },
      include: { user: { include: { role: true } } },
    });
    if (!session || session.expiresAt < new Date() || !session.user.active) return;
    request.sessionId = session.id;
    request.actor = {
      type: "USER",
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      roleName: session.user.role.name,
      permissions: session.user.role.permissions as Permission[],
      defaultLocationId: session.user.defaultLocationId,
    };
    // Sesión deslizante: renueva si queda menos de la mitad del TTL.
    if (session.expiresAt.getTime() - Date.now() < SESSION_TTL_MS / 2) {
      app.db.session
        .update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + SESSION_TTL_MS) } })
        .catch(() => undefined);
    }
  });

  app.decorate("guard", (permission: Permission | null, scope: ApiScope | null = null): preHandlerHookHandler => {
    return async (request: FastifyRequest) => {
      const actor = request.actor;
      if (!actor) throw E.unauthorized();
      if (actor.type === "USER") {
        if (permission && !actor.permissions.includes(permission)) {
          throw E.forbidden(`Tu rol no incluye el permiso "${permission}".`);
        }
        return;
      }
      if (actor.type === "API_KEY") {
        if (scope === null) throw E.forbidden("Este recurso solo está disponible con sesión de usuario.");
        if (!actor.scopes.includes(scope)) {
          throw E.forbidden(`La API key no tiene el alcance requerido: "${scope}".`);
        }
      }
    };
  });

  app.decorate("requireUser", async (request: FastifyRequest) => {
    if (!request.actor || request.actor.type !== "USER") throw E.unauthorized();
  });
});
