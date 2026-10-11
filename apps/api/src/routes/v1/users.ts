import { z } from "zod";
import { createRoleBody, createUserBody, idParam, okResponse, roleSchema, updateRoleBody, updateUserBody, userSchema } from "@inventario/shared";
import type { App } from "../../app";
import { E } from "../../lib/errors";
import { hashPassword } from "../../lib/crypto";
import { audit } from "../../lib/audit";
import { serializeUser as userOut } from "../../lib/serialize";

export default async function userRoutes(app: App) {
  app.get(
    "/users",
    { preValidation: [app.guard("users.manage", null)], schema: { tags: ["Settings"], summary: "Listar usuarios", response: { 200: z.object({ data: z.array(userSchema) }) } } },
    async () => ({ data: (await app.db.user.findMany({ include: { role: true }, orderBy: { name: "asc" } })).map(userOut) }),
  );
  app.post(
    "/users",
    { preValidation: [app.guard("users.manage", null)], schema: { tags: ["Settings"], summary: "Crear usuario", body: createUserBody, response: { 201: userSchema } } },
    async (request, reply) => {
      const b = request.body;
      const role = await app.db.role.findUnique({ where: { id: b.roleId } });
      if (!role) throw E.validation("El rol no existe.", [{ path: "roleId", message: "Selecciona un rol válido." }]);
      const u = await app.db.user.create({ data: { email: b.email.toLowerCase().trim(), name: b.name.trim(), passwordHash: await hashPassword(b.password), roleId: b.roleId, defaultLocationId: b.defaultLocationId ?? null, active: b.active }, include: { role: true } });
      await audit(app.db, request.actor!, "create", "user", u.id, { after: { email: u.email, role: role.name }, ip: request.ip });
      return reply.status(201).send(userOut(u));
    },
  );
  app.patch(
    "/users/:id",
    { preValidation: [app.guard("users.manage", null)], schema: { tags: ["Settings"], summary: "Editar usuario", params: idParam, body: updateUserBody, response: { 200: userSchema } } },
    async (request) => {
      const before = await app.db.user.findUnique({ where: { id: request.params.id }, include: { role: true } });
      if (!before) throw E.notFound("El usuario");
      const b = request.body;
      if (before.id === request.actor!.id && (b.active === false || (b.roleId && b.roleId !== before.roleId))) throw E.validation("No puedes desactivarte ni cambiar tu propio rol.");
      const u = await app.db.user.update({
        where: { id: before.id },
        data: {
          ...(b.email ? { email: b.email.toLowerCase().trim() } : {}),
          ...(b.name ? { name: b.name.trim() } : {}),
          ...(b.password ? { passwordHash: await hashPassword(b.password) } : {}),
          ...(b.roleId ? { roleId: b.roleId } : {}),
          ...(b.defaultLocationId !== undefined ? { defaultLocationId: b.defaultLocationId } : {}),
          ...(b.active !== undefined ? { active: b.active } : {}),
        },
        include: { role: true },
      });
      if (b.active === false || b.password) await app.db.session.deleteMany({ where: { userId: u.id } });
      await audit(app.db, request.actor!, "update", "user", u.id, { before: { email: before.email, role: before.role.name, active: before.active }, after: { email: u.email, role: u.role.name, active: u.active }, ip: request.ip });
      return userOut(u);
    },
  );
  app.delete(
    "/users/:id",
    { preValidation: [app.guard("users.manage", null)], schema: { tags: ["Settings"], summary: "Desactivar usuario", params: idParam, response: { 200: okResponse } } },
    async (request) => {
      if (request.params.id === request.actor!.id) throw E.validation("No puedes eliminar tu propio usuario.");
      const u = await app.db.user.findUnique({ where: { id: request.params.id } });
      if (!u) throw E.notFound("El usuario");
      await app.db.user.update({ where: { id: u.id }, data: { active: false } });
      await app.db.session.deleteMany({ where: { userId: u.id } });
      await audit(app.db, request.actor!, "deactivate", "user", u.id, { ip: request.ip });
      return { ok: true as const };
    },
  );

  app.get(
    "/roles",
    { preValidation: [app.guard("users.manage", null)], schema: { tags: ["Settings"], summary: "Listar roles", response: { 200: z.object({ data: z.array(roleSchema) }) } } },
    async () => ({ data: (await app.db.role.findMany({ orderBy: { name: "asc" } })).map((r) => ({ ...r, permissions: r.permissions as never })) }),
  );
  app.post(
    "/roles",
    { preValidation: [app.guard("users.manage", null)], schema: { tags: ["Settings"], summary: "Crear rol", body: createRoleBody, response: { 201: roleSchema } } },
    async (request, reply) => {
      const r = await app.db.role.create({ data: { name: request.body.name.trim(), permissions: request.body.permissions } });
      await audit(app.db, request.actor!, "create", "role", r.id, { after: r, ip: request.ip });
      return reply.status(201).send({ ...r, permissions: r.permissions as never });
    },
  );
  app.patch(
    "/roles/:id",
    { preValidation: [app.guard("users.manage", null)], schema: { tags: ["Settings"], summary: "Editar rol", params: idParam, body: updateRoleBody, response: { 200: roleSchema } } },
    async (request) => {
      const before = await app.db.role.findUnique({ where: { id: request.params.id } });
      if (!before) throw E.notFound("El rol");
      if (before.isSystem && before.name === "ADMIN") throw E.validation("El rol ADMIN no se puede modificar.");
      const r = await app.db.role.update({ where: { id: before.id }, data: { ...(request.body.name ? { name: request.body.name.trim() } : {}), ...(request.body.permissions ? { permissions: request.body.permissions } : {}) } });
      await audit(app.db, request.actor!, "update", "role", r.id, { before, after: r, ip: request.ip });
      return { ...r, permissions: r.permissions as never };
    },
  );
  app.delete(
    "/roles/:id",
    { preValidation: [app.guard("users.manage", null)], schema: { tags: ["Settings"], summary: "Eliminar rol (sin usuarios)", params: idParam, response: { 200: okResponse } } },
    async (request) => {
      const r = await app.db.role.findUnique({ where: { id: request.params.id }, include: { _count: { select: { users: true } } } });
      if (!r) throw E.notFound("El rol");
      if (r.isSystem) throw E.validation("Los roles del sistema no se pueden eliminar.");
      if (r._count.users > 0) throw E.conflict("Reasigna los usuarios de este rol antes de eliminarlo.");
      await app.db.role.delete({ where: { id: r.id } });
      return { ok: true as const };
    },
  );
}
