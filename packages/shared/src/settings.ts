import { z } from "zod";
import { paginationQuery } from "./common";
import { ApiScope, DeliveryStatus, WebhookEvent } from "./enums";

export const storeSettingsSchema = z.object({
  name: z.string(),
  legalName: z.string().nullable(),
  nit: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  receiptFooter: z.string().nullable(),
  currency: z.string(),
  timezone: z.string(),
  allowNegativeStock: z.boolean(),
  defaultTaxRate: z.number().int(),
  pricesIncludeTax: z.boolean(),
  orderPrefix: z.string(),
  orderNextNumber: z.number().int(),
  lowStockThreshold: z.number().int(),
  updatedAt: z.string(),
});
export const updateStoreSettingsBody = z.object({
  name: z.string().min(1, "Introduce el nombre de la tienda").optional(),
  legalName: z.string().nullable().optional(),
  nit: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email("Introduce un correo válido").nullable().optional().or(z.literal("")),
  receiptFooter: z.string().nullable().optional(),
  allowNegativeStock: z.boolean().optional(),
  defaultTaxRate: z.union([z.literal(0), z.literal(5), z.literal(19)]).optional(),
  pricesIncludeTax: z.boolean().optional(),
  orderPrefix: z.string().max(10).optional(),
  orderNextNumber: z.coerce.number().int().min(1).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
});

export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(ApiScope),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});
export const createApiKeyBody = z.object({
  name: z.string().min(2, "Introduce un nombre descriptivo"),
  scopes: z.array(ApiScope).min(1, "Selecciona al menos un alcance"),
  expiresAt: z.string().nullable().optional(),
});
export const createApiKeyResponse = z.object({
  apiKey: apiKeySchema,
  /** Solo se muestra una vez. */
  token: z.string(),
});

export const webhookSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  description: z.string().nullable(),
  events: z.array(WebhookEvent),
  active: z.boolean(),
  secretPrefix: z.string(),
  lastDeliveryAt: z.string().nullable(),
  lastStatus: DeliveryStatus.nullable(),
  failureCount: z.number().int(),
  createdAt: z.string(),
});
export const createWebhookBody = z.object({
  url: z.string().url("Introduce una URL válida (https://...)"),
  description: z.string().nullable().optional(),
  events: z.array(WebhookEvent).min(1, "Selecciona al menos un evento"),
  active: z.boolean().default(true),
});
export const updateWebhookBody = createWebhookBody.partial();
export const createWebhookResponse = z.object({ webhook: webhookSchema, secret: z.string() });

export const webhookDeliverySchema = z.object({
  id: z.string(),
  webhookId: z.string(),
  event: WebhookEvent,
  status: DeliveryStatus,
  attempts: z.number().int(),
  nextAttemptAt: z.string().nullable(),
  responseStatus: z.number().int().nullable(),
  responseBody: z.string().nullable(),
  error: z.string().nullable(),
  payload: z.unknown(),
  durationMs: z.number().int().nullable(),
  deliveredAt: z.string().nullable(),
  createdAt: z.string(),
});
export const listDeliveriesQuery = paginationQuery.extend({
  webhook_id: z.string().optional(),
  status: DeliveryStatus.optional(),
  event: WebhookEvent.optional(),
});

export const auditLogSchema = z.object({
  id: z.string(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  actorType: z.enum(["USER", "API_KEY", "SYSTEM"]),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  ip: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  createdAt: z.string(),
});
export const listAuditQuery = paginationQuery.extend({
  entity: z.string().optional(),
  entity_id: z.string().optional(),
  actor_id: z.string().optional(),
  action: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const savedViewSchema = z.object({
  id: z.string(),
  resource: z.string(),
  name: z.string(),
  filters: z.record(z.unknown()),
  position: z.number().int(),
});
export const createSavedViewBody = z.object({
  resource: z.string().min(1),
  name: z.string().min(1, "Introduce un nombre para la vista").max(40),
  filters: z.record(z.unknown()),
});
export const updateSavedViewBody = createSavedViewBody.partial();
