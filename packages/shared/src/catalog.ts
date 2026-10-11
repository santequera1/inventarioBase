import { z } from "zod";
import { money, paginationQuery, taxRate } from "./common";
import { ProductStatus } from "./enums";

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  parentId: z.string().nullable(),
  productCount: z.number().int().optional(),
});
export const createCategoryBody = z.object({
  name: z.string().min(1, "Introduce el nombre de la categoría"),
  parentId: z.string().nullable().optional(),
});
export const updateCategoryBody = createCategoryBody.partial();

export const locationSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  phone: z.string().nullable(),
  isDefault: z.boolean(),
  active: z.boolean(),
  sellsOnline: z.boolean(),
  createdAt: z.string(),
});
export const createLocationBody = z.object({
  name: z.string().min(1, "Introduce el nombre de la ubicación"),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
  sellsOnline: z.boolean().optional(),
});
export const updateLocationBody = createLocationBody.partial();

export const supplierSchema = z.object({
  id: z.string(),
  name: z.string(),
  nit: z.string().nullable(),
  contactName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const createSupplierBody = z.object({
  name: z.string().min(1, "Introduce el nombre del proveedor"),
  nit: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  email: z.string().email("Introduce un correo válido").nullable().optional().or(z.literal("")),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().optional(),
});
export const updateSupplierBody = createSupplierBody.partial();

export const productImageSchema = z.object({
  id: z.string(),
  url: z.string(),
  thumbUrl: z.string(),
  alt: z.string().nullable(),
  position: z.number().int(),
});

export const productOption = z.object({
  name: z.string().min(1, "Introduce el nombre de la opción (ej. Talla)"),
  values: z.array(z.string().min(1)).min(1, "Añade al menos un valor"),
});

export const variantSchema = z.object({
  id: z.string(),
  productId: z.string(),
  title: z.string(),
  sku: z.string(),
  barcode: z.string().nullable(),
  price: z.number().int(),
  compareAtPrice: z.number().int().nullable(),
  cost: z.number().int().nullable(),
  weightGrams: z.number().int().nullable(),
  optionValues: z.record(z.string()),
  position: z.number().int(),
  trackInventory: z.boolean(),
  active: z.boolean(),
  imageId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Variant = z.infer<typeof variantSchema>;

export const variantInput = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  sku: z.string().min(1, "Introduce un SKU"),
  barcode: z.string().nullable().optional(),
  price: money,
  compareAtPrice: money.nullable().optional(),
  cost: money.nullable().optional(),
  weightGrams: z.coerce.number().int().min(0).nullable().optional(),
  optionValues: z.record(z.string()).default({}),
  position: z.number().int().optional(),
  trackInventory: z.boolean().default(true),
  active: z.boolean().default(true),
  imageId: z.string().nullable().optional(),
  /** Stock inicial opcional por ubicación (solo al crear). */
  initialStock: z
    .array(z.object({ locationId: z.string(), available: z.coerce.number().int().min(0) }))
    .optional(),
});
export type VariantInput = z.infer<typeof variantInput>;

export const productSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: ProductStatus,
  categoryId: z.string().nullable(),
  category: categorySchema.pick({ id: true, name: true }).nullable().optional(),
  supplierId: z.string().nullable(),
  supplier: supplierSchema.pick({ id: true, name: true }).nullable().optional(),
  tags: z.array(z.string()),
  taxRate: z.number().int(),
  options: z.array(productOption),
  images: z.array(productImageSchema),
  variants: z.array(variantSchema),
  variantCount: z.number().int().optional(),
  totalAvailable: z.number().int().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Product = z.infer<typeof productSchema>;

export const createProductBody = z.object({
  title: z.string().min(1, "Introduce el título del producto"),
  description: z.string().nullable().optional(),
  status: ProductStatus.default("ACTIVE"),
  categoryId: z.string().nullable().optional(),
  supplierId: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  taxRate: taxRate.default(19),
  options: z.array(productOption).default([]),
  variants: z.array(variantInput).min(1, "Añade al menos una variante"),
  imageIds: z.array(z.string()).optional(),
});
export type CreateProductBody = z.infer<typeof createProductBody>;
export const updateProductBody = createProductBody.partial();

export const listProductsQuery = paginationQuery.extend({
  q: z.string().optional(),
  status: ProductStatus.optional(),
  category_id: z.string().optional(),
  supplier_id: z.string().optional(),
  tag: z.string().optional(),
  sku: z.string().optional(),
  updated_since: z.string().datetime({ offset: true }).optional(),
  expand: z.string().optional().describe("variants,images,category,supplier"),
});

export const bulkUpsertProductsBody = z.object({
  products: z
    .array(
      createProductBody.extend({
        variants: z.array(variantInput).min(1),
      }),
    )
    .min(1)
    .max(500),
});

export const updateVariantBody = variantInput.partial().omit({ initialStock: true, id: true });
