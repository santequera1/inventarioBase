import { z } from "zod";

/** Normaliza un número de WhatsApp a solo dígitos con indicativo (Colombia por defecto). */
export function normalizeWhatsapp(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) return `57${digits}`;
  return digits;
}

const whatsappPhone = z
  .string()
  .min(1, "Introduce el número de WhatsApp")
  .refine((v) => {
    const d = normalizeWhatsapp(v);
    return d.length >= 10 && d.length <= 15;
  }, "Número de WhatsApp inválido. Ej.: +57 314 754 3024");

// ---------- Administración ----------

export const catalogSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  whatsappPhone: z.string(),
  active: z.boolean(),
  allProducts: z.boolean(),
  showStock: z.boolean(),
  hideOutOfStock: z.boolean(),
  locationId: z.string().nullable(),
  messageIntro: z.string().nullable(),
  logoUrl: z.string().nullable(),
  logoInvert: z.boolean(),
  views: z.number().int(),
  productIds: z.array(z.string()),
  productCount: z.number().int(),
  inquiryCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Catalog = z.infer<typeof catalogSchema>;

export const createCatalogBody = z.object({
  name: z.string().trim().min(1, "Introduce el nombre del catálogo").max(120),
  description: z.string().max(2000).nullable().optional(),
  whatsappPhone,
  active: z.boolean().default(true),
  allProducts: z.boolean().default(false),
  showStock: z.boolean().default(false),
  hideOutOfStock: z.boolean().default(false),
  locationId: z.string().nullable().optional(),
  messageIntro: z.string().max(500).nullable().optional(),
  logoUrl: z.string().trim().max(500).regex(/^(https?:\/\/|\/)/, "El logo debe ser una URL (https://…) o una ruta que empiece por /").nullable().optional().or(z.literal("").transform(() => null)),
  logoInvert: z.boolean().optional(),
  /** Productos en el orden en que se mostrarán (si `allProducts` es false). */
  productIds: z.array(z.string()).max(2000).default([]),
});
export type CreateCatalogBody = z.infer<typeof createCatalogBody>;

export const updateCatalogBody = z.object({
  name: z.string().trim().min(1, "Introduce el nombre del catálogo").max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  whatsappPhone: whatsappPhone.optional(),
  active: z.boolean().optional(),
  allProducts: z.boolean().optional(),
  showStock: z.boolean().optional(),
  hideOutOfStock: z.boolean().optional(),
  locationId: z.string().nullable().optional(),
  messageIntro: z.string().max(500).nullable().optional(),
  logoUrl: z.string().trim().max(500).regex(/^(https?:\/\/|\/)/, "El logo debe ser una URL (https://…) o una ruta que empiece por /").nullable().optional().or(z.literal("").transform(() => null)),
  logoInvert: z.boolean().optional(),
  productIds: z.array(z.string()).max(2000).optional(),
});

export const addCatalogProductsBody = z.object({
  productIds: z.array(z.string()).min(1, "Selecciona al menos un producto").max(500),
});

export const inquiryLineSchema = z.object({
  variantId: z.string(),
  productId: z.string(),
  productTitle: z.string(),
  variantTitle: z.string(),
  sku: z.string(),
  quantity: z.number().int(),
  unitPrice: z.number().int(),
  total: z.number().int(),
});

export const InquiryStatus = z.enum(["NEW", "CONFIRMED", "CANCELLED"]);

export const catalogInquirySchema = z.object({
  id: z.string(),
  code: z.string(),
  catalogId: z.string(),
  catalogName: z.string().optional(),
  customerName: z.string().nullable(),
  customerNote: z.string().nullable(),
  items: z.array(inquiryLineSchema),
  itemCount: z.number().int(),
  total: z.number().int(),
  message: z.string(),
  status: InquiryStatus,
  createdAt: z.string(),
});
export type CatalogInquiry = z.infer<typeof catalogInquirySchema>;

export const updateInquiryBody = z.object({ status: InquiryStatus });

// ---------- Público ----------

export const publicVariantSchema = z.object({
  id: z.string(),
  title: z.string(),
  optionValues: z.record(z.string()),
  price: z.number().int(),
  compareAtPrice: z.number().int().nullable(),
  imageId: z.string().nullable(),
  inStock: z.boolean(),
  /** Unidades disponibles; null si el catálogo oculta el stock o la variante no controla inventario. */
  available: z.number().int().nullable(),
});

export const publicProductSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  category: z.object({ id: z.string(), name: z.string() }).nullable(),
  options: z.array(z.object({ name: z.string(), values: z.array(z.string()) })),
  images: z.array(z.object({ id: z.string(), url: z.string(), thumbUrl: z.string(), alt: z.string().nullable() })),
  variants: z.array(publicVariantSchema),
});
export type PublicProduct = z.infer<typeof publicProductSchema>;

export const publicCatalogResponse = z.object({
  catalog: z.object({ name: z.string(), slug: z.string(), description: z.string().nullable(), showStock: z.boolean(), logoUrl: z.string().nullable(), logoInvert: z.boolean() }),
  store: z.object({ name: z.string(), city: z.string().nullable(), address: z.string().nullable() }),
  products: z.array(publicProductSchema),
});
export type PublicCatalogResponse = z.infer<typeof publicCatalogResponse>;

export const publicCheckoutBody = z.object({
  items: z
    .array(z.object({ variantId: z.string().min(1), quantity: z.coerce.number().int().min(1, "Cantidad mínima 1").max(999) }))
    .min(1, "El carrito está vacío")
    .max(100),
  customerName: z.string().trim().max(120).optional(),
  note: z.string().trim().max(1000).optional(),
});
export type PublicCheckoutBody = z.infer<typeof publicCheckoutBody>;

export const publicCheckoutResponse = z.object({
  code: z.string(),
  whatsappUrl: z.string(),
  message: z.string(),
  total: z.number().int(),
});
