import { randomBytes } from "node:crypto";
import { formatCOP, normalizeWhatsapp, type PublicProduct } from "@inventario/shared";
import type { Catalog, CatalogInquiry } from "@prisma/client";
import type { Db } from "../lib/prisma";

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomString(len: number, alphabet: string) {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Enlace legible pero no adivinable: `nombre-del-catalogo-k3f9qz7a`. */
export function generateCatalogSlug(name: string) {
  const base = slugify(name);
  const suffix = randomString(8, SLUG_ALPHABET);
  return base ? `${base}-${suffix}` : suffix;
}

export function generateInquiryCode() {
  return `P-${randomString(6, CODE_ALPHABET)}`;
}

export function serializeCatalog(c: Catalog & { items: { productId: string }[]; _count?: { inquiries: number } }, productCount?: number) {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    whatsappPhone: c.whatsappPhone,
    active: c.active,
    allProducts: c.allProducts,
    showStock: c.showStock,
    hideOutOfStock: c.hideOutOfStock,
    locationId: c.locationId,
    messageIntro: c.messageIntro,
    views: c.views,
    productIds: c.items.map((i) => i.productId),
    productCount: productCount ?? c.items.length,
    inquiryCount: c._count?.inquiries ?? 0,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function serializeInquiry(i: CatalogInquiry & { catalog?: { name: string } }) {
  return {
    id: i.id,
    code: i.code,
    catalogId: i.catalogId,
    catalogName: i.catalog?.name,
    customerName: i.customerName,
    customerNote: i.customerNote,
    items: i.items as never,
    itemCount: i.itemCount,
    total: i.total,
    message: i.message,
    status: i.status as "NEW",
    createdAt: i.createdAt.toISOString(),
  };
}

/** Ubicaciones de las que el catálogo toma el stock. */
async function stockLocationIds(db: Db, catalog: Pick<Catalog, "locationId">) {
  if (catalog.locationId) return [catalog.locationId];
  const locs = await db.location.findMany({ where: { active: true, sellsOnline: true }, select: { id: true } });
  return locs.map((l) => l.id);
}

/** Disponible por variante (suma de las ubicaciones del catálogo). */
export async function availableByVariant(db: Db, catalog: Pick<Catalog, "locationId">, variantIds: string[]) {
  const locationIds = await stockLocationIds(db, catalog);
  if (!variantIds.length || !locationIds.length) return new Map<string, number>();
  const sums = await db.inventoryLevel.groupBy({
    by: ["variantId"],
    where: { variantId: { in: variantIds }, locationId: { in: locationIds } },
    _sum: { available: true },
  });
  return new Map(sums.map((s) => [s.variantId, s._sum.available ?? 0]));
}

const publicProductInclude = {
  category: { select: { id: true, name: true } },
  images: { orderBy: { position: "asc" as const } },
  variants: { where: { active: true }, orderBy: { position: "asc" as const } },
} as const;

/** IDs de productos (activos) que pertenecen al catálogo, en orden. */
export async function catalogProducts(db: Db, catalog: Catalog) {
  if (catalog.allProducts) {
    return db.product.findMany({ where: { status: "ACTIVE" }, include: publicProductInclude, orderBy: [{ title: "asc" }] });
  }
  const items = await db.catalogItem.findMany({
    where: { catalogId: catalog.id, product: { status: "ACTIVE" } },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    include: { product: { include: publicProductInclude } },
  });
  return items.map((i) => i.product);
}

export async function buildPublicProducts(db: Db, catalog: Catalog): Promise<PublicProduct[]> {
  const products = (await catalogProducts(db, catalog)).filter((p) => p.variants.length > 0);
  const stock = await availableByVariant(db, catalog, products.flatMap((p) => p.variants.map((v) => v.id)));
  const out: PublicProduct[] = [];
  for (const p of products) {
    const variants = p.variants.map((v) => {
      const available = stock.get(v.id) ?? 0;
      const inStock = !v.trackInventory || available > 0;
      return {
        id: v.id,
        title: v.title,
        optionValues: (v.optionValues as Record<string, string>) ?? {},
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        imageId: v.imageId,
        inStock,
        available: catalog.showStock && v.trackInventory ? Math.max(0, available) : null,
      };
    });
    if (catalog.hideOutOfStock && !variants.some((v) => v.inStock)) continue;
    out.push({
      id: p.id,
      title: p.title,
      description: p.description,
      category: p.category ?? null,
      options: (p.options as { name: string; values: string[] }[]) ?? [],
      images: p.images.map((i) => ({ id: i.id, url: `/uploads/${i.path}`, thumbUrl: `/uploads/${i.thumbPath}`, alt: i.alt })),
      variants,
    });
  }
  return out;
}

export type InquiryLine = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

const money = (n: number) => formatCOP(n).replace(/ /g, " ");

/** Mensaje de WhatsApp con el pedido discriminado línea por línea. */
export function buildWhatsappMessage(opts: {
  catalogName: string;
  intro: string | null;
  code: string;
  lines: InquiryLine[];
  total: number;
  customerName?: string;
  note?: string;
}) {
  const units = opts.lines.reduce((a, l) => a + l.quantity, 0);
  const out: string[] = [];
  out.push(opts.intro?.trim() || `Hola, quiero hacer este pedido del catálogo *${opts.catalogName}*:`);
  out.push("");
  opts.lines.forEach((l, i) => {
    const variant = l.variantTitle && l.variantTitle !== "Default" ? ` (${l.variantTitle})` : "";
    out.push(`${i + 1}. *${l.productTitle}*${variant}`);
    out.push(`   ${l.quantity} x ${money(l.unitPrice)} = ${money(l.total)}`);
    out.push(`   SKU: ${l.sku}`);
  });
  out.push("");
  out.push(`*Total: ${money(opts.total)}* (${units} ${units === 1 ? "unidad" : "unidades"})`);
  if (opts.customerName) out.push(`Nombre: ${opts.customerName}`);
  if (opts.note) out.push(`Nota: ${opts.note}`);
  out.push("");
  out.push(`Código de pedido: *${opts.code}*`);
  return out.join("\n");
}

export function whatsappUrl(phone: string, message: string) {
  return `https://wa.me/${normalizeWhatsapp(phone)}?text=${encodeURIComponent(message)}`;
}
