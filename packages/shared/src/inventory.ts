import { z } from "zod";
import { paginationQuery, quantity } from "./common";
import { AdjustmentMode, CountStatus, MovementType, StockBucket, TransferStatus } from "./enums";
import { locationSchema, variantSchema } from "./catalog";

export const inventoryLevelSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  locationId: z.string(),
  available: z.number().int(),
  committed: z.number().int(),
  unavailable: z.number().int(),
  incoming: z.number().int(),
  onHand: z.number().int().describe("available + committed + unavailable"),
  minStock: z.number().int().nullable(),
  updatedAt: z.string(),
  variant: variantSchema
    .pick({ id: true, title: true, sku: true, barcode: true, price: true, cost: true, optionValues: true })
    .extend({
      product: z.object({
        id: z.string(),
        title: z.string(),
        status: z.string(),
        thumbUrl: z.string().nullable(),
      }),
    })
    .optional(),
  location: locationSchema.pick({ id: true, name: true }).optional(),
});
export type InventoryLevel = z.infer<typeof inventoryLevelSchema>;

export const StockState = z.enum(["in_stock", "low_stock", "out_of_stock"]);

export const listInventoryQuery = paginationQuery.extend({
  q: z.string().optional().describe("Busca por nombre, SKU o código de barras"),
  location_id: z.string().optional(),
  category_id: z.string().optional(),
  sku: z.string().optional(),
  variant_id: z.string().optional(),
  stock_state: StockState.optional(),
  updated_since: z.string().datetime({ offset: true }).optional(),
  expand: z.string().optional(),
});

export const adjustmentInput = z.object({
  variantId: z.string().min(1),
  locationId: z.string().min(1),
  mode: AdjustmentMode,
  bucket: z.enum(["AVAILABLE", "UNAVAILABLE"]).default("AVAILABLE"),
  quantity: quantity.describe(
    "En modo delta: unidades a sumar (positivo) o restar (negativo). En modo set: cantidad final.",
  ),
  reasonId: z.string().optional(),
  reason: z.string().min(2, "Introduce un motivo").optional(),
  note: z.string().max(500).optional(),
}).refine((v) => v.reasonId || v.reason, { message: "El motivo es obligatorio", path: ["reason"] });
export type AdjustmentInput = z.infer<typeof adjustmentInput>;

export const bulkAdjustmentBody = z.object({
  adjustments: z.array(adjustmentInput).min(1).max(500),
});

export const stateChangeBody = z
  .object({
    variantId: z.string(),
    locationId: z.string(),
    from: z.enum(["AVAILABLE", "UNAVAILABLE"]),
    to: z.enum(["AVAILABLE", "UNAVAILABLE"]),
    quantity: z.coerce.number().int().positive("Introduce una cantidad entera mayor que cero"),
    reasonId: z.string().optional(),
    reason: z.string().optional(),
    note: z.string().max(500).optional(),
  })
  .refine((v) => v.from !== v.to, { message: "Origen y destino deben ser distintos", path: ["to"] })
  .refine((v) => v.reasonId || v.reason, { message: "El motivo es obligatorio", path: ["reason"] });

export const setMinStockBody = z.object({
  variantId: z.string(),
  locationId: z.string(),
  minStock: z.coerce.number().int().min(0).nullable(),
});

export const adjustmentPreviewResponse = z.object({
  variantId: z.string(),
  locationId: z.string(),
  bucket: StockBucket,
  before: z.number().int(),
  after: z.number().int(),
  delta: z.number().int(),
  onHandBefore: z.number().int(),
  onHandAfter: z.number().int(),
});

export const movementSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  locationId: z.string(),
  type: MovementType,
  bucket: StockBucket,
  quantity: z.number().int().describe("Con signo: positivo entra, negativo sale"),
  availableAfter: z.number().int(),
  committedAfter: z.number().int(),
  unavailableAfter: z.number().int(),
  incomingAfter: z.number().int(),
  reason: z.string().nullable(),
  note: z.string().nullable(),
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
  referenceLabel: z.string().nullable(),
  actorType: z.enum(["USER", "API_KEY", "SYSTEM"]),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  createdAt: z.string(),
  variant: inventoryLevelSchema.shape.variant.optional(),
  location: locationSchema.pick({ id: true, name: true }).optional(),
});
export type Movement = z.infer<typeof movementSchema>;

export const listMovementsQuery = paginationQuery.extend({
  q: z.string().optional(),
  variant_id: z.string().optional(),
  product_id: z.string().optional(),
  location_id: z.string().optional(),
  type: z.string().optional().describe("Lista separada por coma"),
  bucket: StockBucket.optional(),
  reference_type: z.string().optional(),
  reference_id: z.string().optional(),
  actor_id: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  expand: z.string().optional(),
});

export const transferItemInput = z.object({
  variantId: z.string(),
  quantity: z.coerce.number().int().positive("Introduce una cantidad entera mayor que cero"),
});
export const createTransferBody = z
  .object({
    originLocationId: z.string().min(1, "Selecciona el origen"),
    destinationLocationId: z.string().min(1, "Selecciona el destino"),
    items: z.array(transferItemInput).min(1, "Añade al menos un producto"),
    note: z.string().max(1000).optional(),
    expectedAt: z.string().optional().nullable(),
    /** Si true, la transferencia pasa directamente a IN_TRANSIT (descuenta origen). */
    dispatch: z.boolean().default(false),
  })
  .refine((v) => v.originLocationId !== v.destinationLocationId, {
    message: "Origen y destino deben ser ubicaciones distintas",
    path: ["destinationLocationId"],
  });

export const receiveTransferBody = z.object({
  items: z
    .array(z.object({ variantId: z.string(), quantity: z.coerce.number().int().min(0) }))
    .optional()
    .describe("Si se omite, se reciben todas las cantidades pendientes"),
});

export const transferSchema = z.object({
  id: z.string(),
  number: z.string(),
  status: TransferStatus,
  originLocationId: z.string(),
  destinationLocationId: z.string(),
  origin: locationSchema.pick({ id: true, name: true }),
  destination: locationSchema.pick({ id: true, name: true }),
  note: z.string().nullable(),
  expectedAt: z.string().nullable(),
  dispatchedAt: z.string().nullable(),
  receivedAt: z.string().nullable(),
  items: z.array(
    z.object({
      id: z.string(),
      variantId: z.string(),
      quantity: z.number().int(),
      receivedQuantity: z.number().int(),
      variant: inventoryLevelSchema.shape.variant,
    }),
  ),
  totalQuantity: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const listTransfersQuery = paginationQuery.extend({
  status: TransferStatus.optional(),
  location_id: z.string().optional(),
  q: z.string().optional(),
});

export const createCountBody = z.object({
  locationId: z.string().min(1, "Selecciona la ubicación"),
  note: z.string().optional(),
  items: z
    .array(z.object({ variantId: z.string(), counted: z.coerce.number().int().min(0) }))
    .min(1, "Añade al menos un producto"),
});
export const updateCountBody = z.object({
  note: z.string().optional(),
  items: z.array(z.object({ variantId: z.string(), counted: z.coerce.number().int().min(0) })),
});
export const applyCountBody = z.object({
  reasonId: z.string().optional(),
  reason: z.string().optional(),
});
export const countSchema = z.object({
  id: z.string(),
  number: z.string(),
  locationId: z.string(),
  location: locationSchema.pick({ id: true, name: true }),
  status: CountStatus,
  note: z.string().nullable(),
  items: z.array(
    z.object({
      id: z.string(),
      variantId: z.string(),
      expected: z.number().int(),
      counted: z.number().int(),
      difference: z.number().int(),
      variant: inventoryLevelSchema.shape.variant,
    }),
  ),
  appliedAt: z.string().nullable(),
  createdAt: z.string(),
});
export const listCountsQuery = paginationQuery.extend({
  status: CountStatus.optional(),
  location_id: z.string().optional(),
});

export const reasonSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["ADJUSTMENT", "UNAVAILABLE", "RETURN"]),
  active: z.boolean(),
  position: z.number().int(),
});
export const createReasonBody = z.object({
  name: z.string().min(2, "Introduce el nombre del motivo"),
  kind: z.enum(["ADJUSTMENT", "UNAVAILABLE", "RETURN"]).default("ADJUSTMENT"),
  active: z.boolean().default(true),
});
export const updateReasonBody = createReasonBody.partial();
