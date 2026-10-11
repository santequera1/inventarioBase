import { z } from "zod";
import {
  bulkUpsertProductsBody,
  createProductBody,
  idParam,
  listProductsQuery,
  okResponse,
  paginated,
  productSchema,
  updateProductBody,
  updateVariantBody,
  variantSchema,
} from "@inventario/shared";
import type { App } from "../../app";
import { E } from "../../lib/errors";
import { buildPage, cursorArgs, parseSort } from "../../lib/pagination";
import { audit } from "../../lib/audit";
import { withTx } from "../../lib/prisma";
import { createProduct, productInclude, serializeProduct, updateProduct, variantTitle } from "../../services/products";

export default async function productRoutes(app: App) {
  app.get(
    "/products",
    {
      preValidation: [app.guard("products.read", "read:products")],
      schema: { tags: ["Products"], summary: "Listar productos", querystring: listProductsQuery, response: { 200: paginated(productSchema) } },
    },
    async (request) => {
      const { q, status, category_id, supplier_id, tag, sku, updated_since, cursor, limit, sort } = request.query;
      const where = {
        ...(status ? { status } : {}),
        ...(category_id ? { categoryId: category_id } : {}),
        ...(supplier_id ? { supplierId: supplier_id } : {}),
        ...(tag ? { tags: { has: tag } } : {}),
        ...(updated_since ? { updatedAt: { gte: new Date(updated_since) } } : {}),
        ...(sku ? { variants: { some: { sku: { equals: sku, mode: "insensitive" as const } } } } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" as const } },
                { tags: { has: q } },
                { variants: { some: { OR: [{ sku: { contains: q, mode: "insensitive" as const } }, { barcode: { contains: q } }, { title: { contains: q, mode: "insensitive" as const } }] } } },
              ],
            }
          : {}),
      };
      const s = parseSort(sort, { title: "title", created_at: "createdAt", updated_at: "updatedAt", status: "status" }, { field: "updatedAt", dir: "desc" });
      const [rows, total] = await Promise.all([
        app.db.product.findMany({ where, include: productInclude, orderBy: [{ [s.field]: s.dir }, { id: "asc" }], ...cursorArgs(cursor, limit) }),
        cursor ? Promise.resolve(undefined) : app.db.product.count({ where }),
      ]);
      const variantIds = rows.flatMap((p) => p.variants.map((v) => v.id));
      const sums = variantIds.length
        ? await app.db.inventoryLevel.groupBy({ by: ["variantId"], where: { variantId: { in: variantIds } }, _sum: { available: true } })
        : [];
      const totals = new Map(sums.map((x) => [x.variantId, x._sum.available ?? 0]));
      const page = buildPage(rows, limit, total);
      return { data: page.data.map((p) => serializeProduct(p, totals)), meta: page.meta };
    },
  );

  app.get(
    "/products/:id",
    { preValidation: [app.guard("products.read", "read:products")], schema: { tags: ["Products"], summary: "Producto por id", params: idParam, response: { 200: productSchema } } },
    async (request) => {
      const p = await app.db.product.findUnique({ where: { id: request.params.id }, include: productInclude });
      if (!p) throw E.notFound("El producto");
      const sums = await app.db.inventoryLevel.groupBy({ by: ["variantId"], where: { variantId: { in: p.variants.map((v) => v.id) } }, _sum: { available: true } });
      return serializeProduct(p, new Map(sums.map((x) => [x.variantId, x._sum.available ?? 0])));
    },
  );

  app.post(
    "/products",
    {
      preValidation: [app.guard("products.write", "write:products")],
      config: { idempotent: true },
      schema: { tags: ["Products"], summary: "Crear producto con variantes", body: createProductBody, response: { 201: productSchema } },
    },
    async (request, reply) => {
      const settings = await app.settings();
      const p = await withTx(app.db, (tx) => createProduct(tx, request.body, request.actor!, settings.allowNegativeStock));
      await audit(app.db, request.actor!, "create", "product", p.id, { after: { title: p.title, variants: p.variants.map((v) => v.sku) }, ip: request.ip });
      void app.webhooks.emit("product.created", serializeProduct(p));
      return reply.status(201).send(serializeProduct(p));
    },
  );

  app.patch(
    "/products/:id",
    { preValidation: [app.guard("products.write", "write:products")], schema: { tags: ["Products"], summary: "Editar producto (sincroniza variantes si se envían)", params: idParam, body: updateProductBody, response: { 200: productSchema } } },
    async (request) => {
      const settings = await app.settings();
      const before = await app.db.product.findUnique({ where: { id: request.params.id }, select: { title: true, status: true, taxRate: true } });
      if (!before) throw E.notFound("El producto");
      const p = await withTx(app.db, (tx) => updateProduct(tx, request.params.id, request.body, request.actor!, settings.allowNegativeStock));
      await audit(app.db, request.actor!, "update", "product", p.id, { before, after: { title: p.title, status: p.status, taxRate: p.taxRate }, ip: request.ip });
      void app.webhooks.emit("product.updated", serializeProduct(p));
      return serializeProduct(p);
    },
  );

  app.delete(
    "/products/:id",
    { preValidation: [app.guard("products.write", "write:products")], schema: { tags: ["Products"], summary: "Eliminar producto (archiva si tiene historial)", params: idParam, response: { 200: okResponse.extend({ archived: z.boolean() }) } } },
    async (request) => {
      const p = await app.db.product.findUnique({ where: { id: request.params.id }, include: { variants: { select: { id: true } } } });
      if (!p) throw E.notFound("El producto");
      const ids = p.variants.map((v) => v.id);
      const history = (await app.db.inventoryMovement.count({ where: { variantId: { in: ids } } })) + (await app.db.orderLine.count({ where: { variantId: { in: ids } } }));
      if (history > 0) {
        await app.db.product.update({ where: { id: p.id }, data: { status: "ARCHIVED" } });
        await audit(app.db, request.actor!, "archive", "product", p.id, { ip: request.ip });
        void app.webhooks.emit("product.updated", { id: p.id, status: "ARCHIVED" });
        return { ok: true as const, archived: true };
      }
      await app.db.product.delete({ where: { id: p.id } });
      await audit(app.db, request.actor!, "delete", "product", p.id, { before: { title: p.title }, ip: request.ip });
      void app.webhooks.emit("product.deleted", { id: p.id });
      return { ok: true as const, archived: false };
    },
  );

  app.post(
    "/products/bulk",
    {
      preValidation: [app.guard("products.write", "write:products")],
      config: { idempotent: true },
      schema: {
        tags: ["Products"],
        summary: "Upsert masivo de productos por SKU",
        description: "Para cada producto: si alguna variante tiene un SKU existente, se actualiza ese producto (y sus variantes por SKU); si no, se crea. Útil para sincronizaciones.",
        body: bulkUpsertProductsBody,
        response: { 200: z.object({ created: z.number().int(), updated: z.number().int(), results: z.array(z.object({ sku: z.string(), productId: z.string(), action: z.enum(["created", "updated"]) })) }) },
      },
    },
    async (request) => {
      const settings = await app.settings();
      let created = 0;
      let updated = 0;
      const results: { sku: string; productId: string; action: "created" | "updated" }[] = [];
      for (const body of request.body.products) {
        const skus = body.variants.map((v) => v.sku.trim());
        const existing = await app.db.variant.findFirst({ where: { sku: { in: skus } }, select: { productId: true, product: { include: { variants: true } } } });
        if (existing) {
          const variants = body.variants.map((v) => ({ ...v, id: existing.product.variants.find((cv) => cv.sku === v.sku.trim())?.id }));
          // mantener variantes existentes no enviadas
          const missing = existing.product.variants.filter((cv) => !skus.includes(cv.sku)).map((cv) => ({ id: cv.id, sku: cv.sku, price: cv.price, compareAtPrice: cv.compareAtPrice, cost: cv.cost, barcode: cv.barcode, weightGrams: cv.weightGrams, optionValues: (cv.optionValues as Record<string, string>) ?? {}, trackInventory: cv.trackInventory, active: cv.active, title: cv.title, position: cv.position, imageId: cv.imageId }));
          const p = await withTx(app.db, (tx) => updateProduct(tx, existing.productId, { ...body, variants: [...variants, ...missing] }, request.actor!, settings.allowNegativeStock));
          updated++;
          results.push({ sku: skus[0]!, productId: p.id, action: "updated" });
          void app.webhooks.emit("product.updated", serializeProduct(p));
        } else {
          const p = await withTx(app.db, (tx) => createProduct(tx, body, request.actor!, settings.allowNegativeStock));
          created++;
          results.push({ sku: skus[0]!, productId: p.id, action: "created" });
          void app.webhooks.emit("product.created", serializeProduct(p));
        }
      }
      await audit(app.db, request.actor!, "bulk_upsert", "product", null, { after: { created, updated }, ip: request.ip });
      return { created, updated, results };
    },
  );

  // ---- Variantes ----
  app.get(
    "/variants",
    {
      preValidation: [app.guard("products.read", "read:products")],
      schema: {
        tags: ["Products"],
        summary: "Buscar variantes (POS / lector de código de barras)",
        querystring: z.object({ q: z.string().optional(), sku: z.string().optional(), barcode: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(20), location_id: z.string().optional(), active_only: z.enum(["true", "false"]).default("true") }),
        response: {
          200: z.object({
            data: z.array(
              variantSchema.extend({
                product: z.object({ id: z.string(), title: z.string(), status: z.string(), taxRate: z.number().int(), thumbUrl: z.string().nullable() }),
                available: z.number().int().nullable(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const { q, sku, barcode, limit, location_id, active_only } = request.query;
      const where = {
        ...(active_only === "true" ? { active: true, product: { status: "ACTIVE" } } : {}),
        ...(sku ? { sku: { equals: sku, mode: "insensitive" as const } } : {}),
        ...(barcode ? { barcode } : {}),
        ...(q
          ? { OR: [{ sku: { contains: q, mode: "insensitive" as const } }, { barcode: { equals: q } }, { title: { contains: q, mode: "insensitive" as const } }, { product: { title: { contains: q, mode: "insensitive" as const } } }] }
          : {}),
      };
      const rows = await app.db.variant.findMany({ where, take: limit, orderBy: [{ product: { title: "asc" } }, { position: "asc" }], include: { product: { include: { images: { orderBy: { position: "asc" }, take: 1 } } }, image: true, levels: location_id ? { where: { locationId: location_id } } : true } });
      return {
        data: rows.map((v) => ({
          ...v,
          optionValues: (v.optionValues as Record<string, string>) ?? {},
          createdAt: v.createdAt.toISOString(),
          updatedAt: v.updatedAt.toISOString(),
          product: { id: v.product.id, title: v.product.title, status: v.product.status, taxRate: v.product.taxRate, thumbUrl: v.image ? `/uploads/${v.image.thumbPath}` : v.product.images[0] ? `/uploads/${v.product.images[0].thumbPath}` : null },
          available: v.levels.length ? v.levels.reduce((a, l) => a + l.available, 0) : location_id ? 0 : null,
        })),
      };
    },
  );

  app.get(
    "/variants/:id",
    { preValidation: [app.guard("products.read", "read:products")], schema: { tags: ["Products"], summary: "Variante por id", params: idParam, response: { 200: variantSchema } } },
    async (request) => {
      const v = await app.db.variant.findUnique({ where: { id: request.params.id } });
      if (!v) throw E.notFound("La variante");
      return { ...v, optionValues: (v.optionValues as Record<string, string>) ?? {}, createdAt: v.createdAt.toISOString(), updatedAt: v.updatedAt.toISOString() };
    },
  );

  app.patch(
    "/variants/:id",
    { preValidation: [app.guard("products.write", "write:products")], schema: { tags: ["Products"], summary: "Editar variante", params: idParam, body: updateVariantBody, response: { 200: variantSchema } } },
    async (request) => {
      const v = await app.db.variant.findUnique({ where: { id: request.params.id }, include: { product: true } });
      if (!v) throw E.notFound("La variante");
      if (request.body.sku && request.body.sku.trim() !== v.sku) {
        const taken = await app.db.variant.findUnique({ where: { sku: request.body.sku.trim() } });
        if (taken) throw E.validation(`El SKU "${request.body.sku}" ya está en uso.`, [{ path: "sku", message: "Este SKU ya está en uso." }]);
      }
      const options = (v.product.options as { name: string }[]) ?? [];
      const b = request.body;
      const row = await app.db.variant.update({
        where: { id: v.id },
        data: {
          ...(b.sku !== undefined ? { sku: b.sku.trim() } : {}),
          ...(b.barcode !== undefined ? { barcode: b.barcode?.trim() || null } : {}),
          ...(b.price !== undefined ? { price: b.price } : {}),
          ...(b.compareAtPrice !== undefined ? { compareAtPrice: b.compareAtPrice } : {}),
          ...(b.cost !== undefined ? { cost: b.cost } : {}),
          ...(b.weightGrams !== undefined ? { weightGrams: b.weightGrams } : {}),
          ...(b.optionValues !== undefined ? { optionValues: b.optionValues, title: b.title?.trim() || variantTitle(b.optionValues, options) } : b.title !== undefined ? { title: b.title.trim() } : {}),
          ...(b.trackInventory !== undefined ? { trackInventory: b.trackInventory } : {}),
          ...(b.active !== undefined ? { active: b.active } : {}),
          ...(b.imageId !== undefined ? { imageId: b.imageId } : {}),
          ...(b.position !== undefined ? { position: b.position } : {}),
        },
      });
      await app.db.product.update({ where: { id: v.productId }, data: { updatedAt: new Date() } });
      await audit(app.db, request.actor!, "update", "variant", row.id, { before: { price: v.price, cost: v.cost, sku: v.sku }, after: { price: row.price, cost: row.cost, sku: row.sku }, ip: request.ip });
      void app.webhooks.emit("product.updated", { id: v.productId, variantId: row.id });
      return { ...row, optionValues: (row.optionValues as Record<string, string>) ?? {}, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
    },
  );
}
