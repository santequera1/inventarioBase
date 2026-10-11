import { z } from "zod";
import { money, paginationQuery } from "./common";
import { PurchaseOrderStatus } from "./enums";
import { locationSchema, supplierSchema } from "./catalog";
import { inventoryLevelSchema } from "./inventory";

export const purchaseItemInput = z.object({
  variantId: z.string(),
  quantity: z.coerce.number().int().positive("Introduce una cantidad entera mayor que cero"),
  unitCost: money,
});
export const createPurchaseOrderBody = z.object({
  supplierId: z.string().min(1, "Selecciona un proveedor"),
  locationId: z.string().min(1, "Selecciona la ubicación de destino"),
  items: z.array(purchaseItemInput).min(1, "Añade al menos un producto"),
  expectedAt: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  /** Si true, pasa a ORDERED y alimenta "Entrante". */
  place: z.boolean().default(false),
});
export const updatePurchaseOrderBody = createPurchaseOrderBody.partial().omit({ place: true });
export const receivePurchaseOrderBody = z.object({
  items: z
    .array(
      z.object({
        variantId: z.string(),
        quantity: z.coerce.number().int().min(0),
        unitCost: money.optional(),
      }),
    )
    .optional(),
  note: z.string().optional(),
});
export const purchaseOrderSchema = z.object({
  id: z.string(),
  number: z.string(),
  status: PurchaseOrderStatus,
  supplierId: z.string(),
  supplier: supplierSchema.pick({ id: true, name: true }),
  locationId: z.string(),
  location: locationSchema.pick({ id: true, name: true }),
  reference: z.string().nullable(),
  note: z.string().nullable(),
  expectedAt: z.string().nullable(),
  orderedAt: z.string().nullable(),
  receivedAt: z.string().nullable(),
  subtotal: z.number().int(),
  items: z.array(
    z.object({
      id: z.string(),
      variantId: z.string(),
      quantity: z.number().int(),
      receivedQuantity: z.number().int(),
      unitCost: z.number().int(),
      variant: inventoryLevelSchema.shape.variant,
    }),
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const listPurchaseOrdersQuery = paginationQuery.extend({
  status: PurchaseOrderStatus.optional(),
  supplier_id: z.string().optional(),
  location_id: z.string().optional(),
  q: z.string().optional(),
});
