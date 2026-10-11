import { z } from "zod";
import { apiKeySchema, createApiKeyBody, createApiKeyResponse, idParam, okResponse } from "@inventario/shared";
import type { App } from "../../app";
import { E } from "../../lib/errors";
import { generateApiKey } from "../../lib/crypto";
import { audit } from "../../lib/audit";

const include = { createdBy: { select: { name: true } } } as const;
const serialize = (k: { id: string; name: string; prefix: string; scopes: string[]; lastUsedAt: Date | null; revokedAt: Date | null; expiresAt: Date | null; createdAt: Date; createdBy: { name: string } | null }) => ({
  id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes as never, lastUsedAt: k.lastUsedAt?.toISOString() ?? null, revokedAt: k.revokedAt?.toISOString() ?? null, expiresAt: k.expiresAt?.toISOString() ?? null, createdByName: k.createdBy?.name ?? null, createdAt: k.createdAt.toISOString(),
});

export default async function apiKeyRoutes(app: App) {
  app.get(
    "/api-keys",
    { preValidation: [app.guard("apikeys.manage", null)], schema: { tags: ["ApiKeys"], summary: "Listar API keys", response: { 200: z.object({ data: z.array(apiKeySchema) }) } } },
    async () => ({ data: (await app.db.apiKey.findMany({ include, orderBy: { createdAt: "desc" } })).map(serialize) }),
  );
  app.post(
    "/api-keys",
    { preValidation: [app.guard("apikeys.manage", null)], schema: { tags: ["ApiKeys"], summary: "Crear API key (el token se muestra una sola vez)", body: createApiKeyBody, response: { 201: createApiKeyResponse } } },
    async (request, reply) => {
      const { token, prefix, hash } = generateApiKey();
      const k = await app.db.apiKey.create({ data: { name: request.body.name.trim(), prefix, hash, scopes: request.body.scopes, expiresAt: request.body.expiresAt ? new Date(request.body.expiresAt) : null, createdById: request.actor!.id }, include });
      await audit(app.db, request.actor!, "create", "api_key", k.id, { after: { name: k.name, scopes: k.scopes }, ip: request.ip });
      return reply.status(201).send({ apiKey: serialize(k), token });
    },
  );
  app.patch(
    "/api-keys/:id",
    { preValidation: [app.guard("apikeys.manage", null)], schema: { tags: ["ApiKeys"], summary: "Editar nombre o scopes", params: idParam, body: createApiKeyBody.partial(), response: { 200: apiKeySchema } } },
    async (request) => {
      const k = await app.db.apiKey.update({ where: { id: request.params.id }, data: { ...(request.body.name ? { name: request.body.name.trim() } : {}), ...(request.body.scopes ? { scopes: request.body.scopes } : {}), ...(request.body.expiresAt !== undefined ? { expiresAt: request.body.expiresAt ? new Date(request.body.expiresAt) : null } : {}) }, include });
      await audit(app.db, request.actor!, "update", "api_key", k.id, { after: { name: k.name, scopes: k.scopes }, ip: request.ip });
      return serialize(k);
    },
  );
  app.post(
    "/api-keys/:id/revoke",
    { preValidation: [app.guard("apikeys.manage", null)], schema: { tags: ["ApiKeys"], summary: "Revocar API key", params: idParam, response: { 200: apiKeySchema } } },
    async (request) => {
      const k = await app.db.apiKey.findUnique({ where: { id: request.params.id } });
      if (!k) throw E.notFound("La API key");
      const updated = await app.db.apiKey.update({ where: { id: k.id }, data: { revokedAt: new Date() }, include });
      await audit(app.db, request.actor!, "revoke", "api_key", k.id, { ip: request.ip });
      return serialize(updated);
    },
  );
  app.delete(
    "/api-keys/:id",
    { preValidation: [app.guard("apikeys.manage", null)], schema: { tags: ["ApiKeys"], summary: "Eliminar API key", params: idParam, response: { 200: okResponse } } },
    async (request) => {
      await app.db.apiKey.delete({ where: { id: request.params.id } });
      await audit(app.db, request.actor!, "delete", "api_key", request.params.id, { ip: request.ip });
      return { ok: true as const };
    },
  );
}
