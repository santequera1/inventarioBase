import { z } from "zod";
import { changePasswordBody, loginBody, meResponse, okResponse, problem, type Permission } from "@inventario/shared";
import type { App } from "../app";
import { SESSION_TTL_MS } from "../config";
import { hashPassword, randomToken, verifyPassword } from "../lib/crypto";
import { E } from "../lib/errors";
import { audit } from "../lib/audit";
import { serializeUser } from "../lib/serialize";

export default async function authRoutes(app: App) {
  app.post(
    "/login",
    {
      config: { strictRateLimit: true },
      schema: {
        tags: ["Auth"],
        summary: "Iniciar sesión (cookie httpOnly)",
        body: loginBody,
        response: { 200: meResponse, 401: problem },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const user = await app.db.user.findUnique({ where: { email: email.toLowerCase().trim() }, include: { role: true } });
      const ok = user ? await verifyPassword(user.passwordHash, password) : false;
      if (!user || !ok || !user.active) {
        throw E.unauthorized("Correo o contraseña incorrectos.");
      }
      const sessionId = randomToken(32);
      await app.db.session.create({
        data: {
          id: sessionId,
          userId: user.id,
          userAgent: request.headers["user-agent"]?.slice(0, 300) ?? null,
          ip: request.ip,
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        },
      });
      await app.db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      app.setSessionCookie(reply, sessionId);
      await audit(app.db, { type: "USER", id: user.id, name: user.name, email: user.email, permissions: [], roleName: user.role.name, defaultLocationId: null }, "login", "user", user.id, { ip: request.ip });
      return { user: serializeUser(user), permissions: user.role.permissions as Permission[] };
    },
  );

  app.post(
    "/logout",
    { schema: { tags: ["Auth"], summary: "Cerrar sesión", response: { 200: okResponse } } },
    async (request, reply) => {
      if (request.sessionId) await app.db.session.delete({ where: { id: request.sessionId } }).catch(() => undefined);
      app.clearSessionCookie(reply);
      return { ok: true as const };
    },
  );

  app.get(
    "/me",
    { preValidation: [app.requireUser], schema: { tags: ["Auth"], summary: "Usuario actual", response: { 200: meResponse, 401: problem } } },
    async (request) => {
      const actor = request.actor!;
      const user = await app.db.user.findUniqueOrThrow({ where: { id: actor.id! }, include: { role: true } });
      return { user: serializeUser(user), permissions: user.role.permissions as Permission[] };
    },
  );

  app.post(
    "/change-password",
    { preValidation: [app.requireUser], schema: { tags: ["Auth"], summary: "Cambiar contraseña propia", body: changePasswordBody, response: { 200: okResponse } } },
    async (request) => {
      const actor = request.actor!;
      const user = await app.db.user.findUniqueOrThrow({ where: { id: actor.id! } });
      if (!(await verifyPassword(user.passwordHash, request.body.currentPassword))) {
        throw E.validation("La contraseña actual no es correcta.", [{ path: "currentPassword", message: "La contraseña actual no es correcta." }]);
      }
      await app.db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(request.body.newPassword) } });
      // Cierra las demás sesiones.
      await app.db.session.deleteMany({ where: { userId: user.id, NOT: { id: request.sessionId ?? "" } } });
      return { ok: true as const };
    },
  );

  app.get(
    "/sessions",
    {
      preValidation: [app.requireUser],
      schema: {
        tags: ["Auth"],
        summary: "Sesiones activas del usuario",
        response: { 200: z.array(z.object({ id: z.string(), userAgent: z.string().nullable(), ip: z.string().nullable(), createdAt: z.string(), current: z.boolean() })) },
      },
    },
    async (request) => {
      const rows = await app.db.session.findMany({ where: { userId: request.actor!.id!, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
      return rows.map((s) => ({ id: s.id.slice(0, 8), userAgent: s.userAgent, ip: s.ip, createdAt: s.createdAt.toISOString(), current: s.id === request.sessionId }));
    },
  );
}
