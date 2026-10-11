import type { CreateProductBody, VariantInput } from "@inventario/shared";
import type { Tx } from "../lib/prisma";
import { E } from "../lib/errors";
import type { Actor } from "../lib/actor";
import { applyMovements } from "./inventory";

export const productInclude = {
  category: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  images: { orderBy: { position: "asc" as const } },
  variants: { orderBy: { position: "asc" as const } },
} as const;

export function variantTitle(optionValues: Record<string, string>, options: { name: string }[]): string {
  const parts = options.map((o) => optionValues[o.name]).filter(Boolean);
  return parts.length ? parts.join(" / ") : "Default";
}

export function serializeProduct(p: {
  id: string;
  title: string;
  description: string | null;
  status: string;
  categoryId: string | null;
  category?: { id: string; name: string } | null;
  supplierId: string | null;
  supplier?: { id: string; name: string } | null;
  tags: string[];
  taxRate: number;
  options: unknown;
  images: { id: string; path: string; thumbPath: string; alt: string | null; position: number }[];
  variants: {
    id: string; productId: string; title: string; sku: string; barcode: string | null; price: number; compareAtPrice: number | null; cost: number | null;
    weightGrams: number | null; optionValues: unknown; position: number; trackInventory: boolean; active: boolean; imageId: string | null; createdAt: Date; updatedAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}, totals?: Map<string, number>) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    status: p.status as "ACTIVE",
    categoryId: p.categoryId,
    category: p.category ?? null,
    supplierId: p.supplierId,
    supplier: p.supplier ?? null,
    tags: p.tags,
    taxRate: p.taxRate,
    options: (p.options as { name: string; values: string[] }[]) ?? [],
    images: p.images.map((i) => ({ id: i.id, url: `/uploads/${i.path}`, thumbUrl: `/uploads/${i.thumbPath}`, alt: i.alt, position: i.position })),
    variants: p.variants.map((v) => ({
      ...v,
      optionValues: (v.optionValues as Record<string, string>) ?? {},
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    })),
    variantCount: p.variants.length,
    totalAvailable: totals ? p.variants.reduce((acc, v) => acc + (totals.get(v.id) ?? 0), 0) : undefined,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Garantiza una fila de nivel (en cero) por cada variante y ubicación activa, para que el listado muestre todo. */
export async function ensureLevels(tx: Tx, variantIds: string[], locationIds?: string[]) {
  const locs = locationIds ?? (await tx.location.findMany({ where: { active: true }, select: { id: true } })).map((l) => l.id);
  if (!variantIds.length || !locs.length) return;
  await tx.inventoryLevel.createMany({ data: variantIds.flatMap((variantId) => locs.map((locationId) => ({ variantId, locationId }))), skipDuplicates: true });
}

export async function ensureSkusUnique(tx: Tx, variants: { sku: string; id?: string }[], productId?: string) {
  const skus = variants.map((v) => v.sku.trim());
  const dup = skus.find((s, i) => skus.indexOf(s) !== i);
  if (dup) throw E.validation(`El SKU "${dup}" está repetido en las variantes.`, [{ path: "variants", message: `SKU repetido: ${dup}` }]);
  const existing = await tx.variant.findMany({ where: { sku: { in: skus } }, select: { sku: true, productId: true, id: true } });
  for (const e of existing) {
    const ours = variants.find((v) => v.sku.trim() === e.sku);
    if (e.productId !== productId || (ours?.id && ours.id !== e.id)) {
      throw E.validation(`El SKU "${e.sku}" ya pertenece a otro producto.`, [{ path: "variants", message: `El SKU ${e.sku} ya está en uso.` }]);
    }
  }
}

export async function createProduct(tx: Tx, body: CreateProductBody, actor: Actor, allowNegative: boolean) {
  await ensureSkusUnique(tx, body.variants);
  const product = await tx.product.create({
    data: {
      title: body.title.trim(),
      description: body.description ?? null,
      status: body.status,
      categoryId: body.categoryId ?? null,
      supplierId: body.supplierId ?? null,
      tags: body.tags.map((t) => t.trim()).filter(Boolean),
      taxRate: body.taxRate,
      options: body.options,
      variants: {
        create: body.variants.map((v, i) => variantData(v, i, body.options)),
      },
    },
    include: productInclude,
  });
  if (body.imageIds?.length) {
    await Promise.all(body.imageIds.map((id, i) => tx.productImage.updateMany({ where: { id, productId: null }, data: { productId: product.id, position: i } })));
  }
  await ensureLevels(tx, product.variants.map((v) => v.id));
  // Stock inicial
  const movements = [];
  for (const v of body.variants) {
    const created = product.variants.find((x) => x.sku === v.sku.trim());
    if (!created || !v.initialStock) continue;
    for (const s of v.initialStock) {
      if (s.available > 0) {
        movements.push({ variantId: created.id, locationId: s.locationId, type: "ADJUSTMENT" as const, bucket: "AVAILABLE" as const, quantity: s.available, reason: "Stock inicial", referenceType: "PRODUCT", referenceId: product.id, referenceLabel: product.title });
      }
    }
  }
  if (movements.length) await applyMovements(tx, movements, actor, { allowNegativeAvailable: allowNegative });
  return tx.product.findUniqueOrThrow({ where: { id: product.id }, include: productInclude });
}

export function variantData(v: VariantInput, index: number, options: { name: string }[]) {
  return {
    title: v.title?.trim() || variantTitle(v.optionValues, options),
    sku: v.sku.trim(),
    barcode: v.barcode?.trim() || null,
    price: v.price,
    compareAtPrice: v.compareAtPrice ?? null,
    cost: v.cost ?? null,
    weightGrams: v.weightGrams ?? null,
    optionValues: v.optionValues,
    position: v.position ?? index,
    trackInventory: v.trackInventory,
    active: v.active,
    imageId: v.imageId ?? null,
  };
}

/** Actualiza producto; sincroniza variantes: crea nuevas, actualiza existentes, desactiva/elimina las ausentes. */
export async function updateProduct(tx: Tx, id: string, body: Partial<CreateProductBody>, actor: Actor, allowNegative: boolean) {
  const current = await tx.product.findUnique({ where: { id }, include: productInclude });
  if (!current) throw E.notFound("El producto");
  const options = body.options ?? ((current.options as { name: string; values: string[] }[]) ?? []);
  await tx.product.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
      ...(body.supplierId !== undefined ? { supplierId: body.supplierId } : {}),
      ...(body.tags !== undefined ? { tags: body.tags.map((t) => t.trim()).filter(Boolean) } : {}),
      ...(body.taxRate !== undefined ? { taxRate: body.taxRate } : {}),
      ...(body.options !== undefined ? { options: body.options } : {}),
    },
  });
  if (body.imageIds) {
    await tx.productImage.updateMany({ where: { productId: id, id: { notIn: body.imageIds } }, data: { productId: null } });
    await Promise.all(body.imageIds.map((imgId, i) => tx.productImage.updateMany({ where: { id: imgId, OR: [{ productId: null }, { productId: id }] }, data: { productId: id, position: i } })));
  }
  if (body.variants) {
    await ensureSkusUnique(tx, body.variants, id);
    const keepIds = new Set<string>();
    for (const [i, v] of body.variants.entries()) {
      const data = variantData(v, i, options);
      if (v.id && current.variants.some((cv) => cv.id === v.id)) {
        await tx.variant.update({ where: { id: v.id }, data });
        keepIds.add(v.id);
      } else {
        const created = await tx.variant.create({ data: { ...data, productId: id } });
        keepIds.add(created.id);
        await ensureLevels(tx, [created.id]);
        if (v.initialStock?.length) {
          await applyMovements(
            tx,
            v.initialStock.filter((s) => s.available > 0).map((s) => ({ variantId: created.id, locationId: s.locationId, type: "ADJUSTMENT" as const, bucket: "AVAILABLE" as const, quantity: s.available, reason: "Stock inicial", referenceType: "PRODUCT", referenceId: id, referenceLabel: current.title })),
            actor,
            { allowNegativeAvailable: allowNegative },
          );
        }
      }
    }
    // Variantes eliminadas: si tienen historial se desactivan; si no, se borran.
    for (const cv of current.variants) {
      if (keepIds.has(cv.id)) continue;
      const hasHistory = (await tx.inventoryMovement.count({ where: { variantId: cv.id } })) > 0 || (await tx.orderLine.count({ where: { variantId: cv.id } })) > 0;
      if (hasHistory) await tx.variant.update({ where: { id: cv.id }, data: { active: false } });
      else await tx.variant.delete({ where: { id: cv.id } });
    }
  }
  return tx.product.findUniqueOrThrow({ where: { id }, include: productInclude });
}
