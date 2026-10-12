import { z } from "zod";
import {
  addCatalogProductsBody,
  catalogInquirySchema,
  catalogSchema,
  createCatalogBody,
  idParam,
  normalizeWhatsapp,
  okResponse,
  updateCatalogBody,
  updateInquiryBody,
  InquiryStatus,
} from "@inventario/shared";
import type { App } from "../../app";
import { E } from "../../lib/errors";
import { audit } from "../../lib/audit";
import type { Tx } from "../../lib/prisma";
import { generateCatalogSlug, serializeCatalog, serializeInquiry } from "../../services/catalogs";

const catalogInclude = { items: { orderBy: [{ position: "asc" as const }, { id: "asc" as const }], select: { productId: true } }, _count: { select: { inquiries: true } } };

async function replaceItems(tx: Tx, catalogId: string, productIds: string[]) {
  const unique = [...new Set(productIds)];
  if (unique.length) {
    const found = await tx.product.count({ where: { id: { in: unique } } });
    if (found !== unique.length) throw E.validation("Uno o más productos seleccionados no existen.", [{ path: "productIds", message: "Producto inexistente" }]);
  }
  await tx.catalogItem.deleteMany({ where: { catalogId } });
  if (unique.length) await tx.catalogItem.createMany({ data: unique.map((productId, position) => ({ catalogId, productId, position })) });
}

async function checkLocation(app: App, locationId: string | null | undefined) {
  if (!locationId) return;
  const loc = await app.db.location.findUnique({ where: { id: locationId } });
  if (!loc) throw E.validation("La ubicación seleccionada no existe.", [{ path: "locationId", message: "Ubicación inexistente" }]);
}

export default async function catalogRoutes(app: App) {
  const activeProductCount = () => app.db.product.count({ where: { status: "ACTIVE" } });

  app.get(
    "/catalogs",
    { preValidation: [app.guard("products.read", "read:products")], schema: { tags: ["Catalogs"], summary: "Listar catálogos compartibles", response: { 200: z.object({ data: z.array(catalogSchema) }) } } },
    async () => {
      const rows = await app.db.catalog.findMany({ include: catalogInclude, orderBy: [{ createdAt: "desc" }] });
      const all = rows.some((r) => r.allProducts) ? await activeProductCount() : 0;
      return { data: rows.map((r) => serializeCatalog(r, r.allProducts ? all : undefined)) };
    },
  );

  app.get(
    "/catalogs/:id",
    { preValidation: [app.guard("products.read", "read:products")], schema: { tags: ["Catalogs"], summary: "Catálogo", params: idParam, response: { 200: catalogSchema } } },
    async (request) => {
      const row = await app.db.catalog.findUnique({ where: { id: request.params.id }, include: catalogInclude });
      if (!row) throw E.notFound("El catálogo");
      return serializeCatalog(row, row.allProducts ? await activeProductCount() : undefined);
    },
  );

  app.post(
    "/catalogs",
    { preValidation: [app.guard("products.write", "write:products")], schema: { tags: ["Catalogs"], summary: "Crear catálogo", body: createCatalogBody, response: { 201: catalogSchema } } },
    async (request, reply) => {
      const { productIds, whatsappPhone, ...data } = request.body;
      await checkLocation(app, data.locationId);
      const created = await app.db.$transaction(async (tx) => {
        const c = await tx.catalog.create({ data: { ...data, whatsappPhone: normalizeWhatsapp(whatsappPhone), slug: generateCatalogSlug(data.name) } });
        await replaceItems(tx, c.id, productIds);
        return c;
      });
      const row = await app.db.catalog.findUniqueOrThrow({ where: { id: created.id }, include: catalogInclude });
      await audit(app.db, request.actor!, "create", "catalog", row.id, { after: { ...created, productIds }, ip: request.ip });
      return reply.status(201).send(serializeCatalog(row, row.allProducts ? await activeProductCount() : undefined));
    },
  );

  app.patch(
    "/catalogs/:id",
    { preValidation: [app.guard("products.write", "write:products")], schema: { tags: ["Catalogs"], summary: "Editar catálogo", params: idParam, body: updateCatalogBody, response: { 200: catalogSchema } } },
    async (request) => {
      const before = await app.db.catalog.findUnique({ where: { id: request.params.id } });
      if (!before) throw E.notFound("El catálogo");
      const { productIds, whatsappPhone, ...data } = request.body;
      await checkLocation(app, data.locationId);
      await app.db.$transaction(async (tx) => {
        await tx.catalog.update({ where: { id: before.id }, data: { ...data, ...(whatsappPhone ? { whatsappPhone: normalizeWhatsapp(whatsappPhone) } : {}) } });
        if (productIds) await replaceItems(tx, before.id, productIds);
      });
      const row = await app.db.catalog.findUniqueOrThrow({ where: { id: before.id }, include: catalogInclude });
      await audit(app.db, request.actor!, "update", "catalog", row.id, { before, after: request.body, ip: request.ip });
      return serializeCatalog(row, row.allProducts ? await activeProductCount() : undefined);
    },
  );

  app.post(
    "/catalogs/:id/products",
    { preValidation: [app.guard("products.write", "write:products")], schema: { tags: ["Catalogs"], summary: "Agregar productos al final del catálogo (ignora los que ya están)", params: idParam, body: addCatalogProductsBody, response: { 200: catalogSchema } } },
    async (request) => {
      const catalog = await app.db.catalog.findUnique({ where: { id: request.params.id }, include: { items: { select: { productId: true, position: true } } } });
      if (!catalog) throw E.notFound("El catálogo");
      const existing = new Set(catalog.items.map((i) => i.productId));
      const toAdd = [...new Set(request.body.productIds)].filter((id) => !existing.has(id));
      if (toAdd.length) {
        const found = await app.db.product.count({ where: { id: { in: toAdd } } });
        if (found !== toAdd.length) throw E.validation("Uno o más productos no existen.");
        const start = catalog.items.reduce((m, i) => Math.max(m, i.position + 1), 0);
        await app.db.catalogItem.createMany({ data: toAdd.map((productId, i) => ({ catalogId: catalog.id, productId, position: start + i })), skipDuplicates: true });
        await app.db.catalog.update({ where: { id: catalog.id }, data: { updatedAt: new Date() } });
      }
      await audit(app.db, request.actor!, "add_products", "catalog", catalog.id, { after: { added: toAdd }, ip: request.ip });
      const row = await app.db.catalog.findUniqueOrThrow({ where: { id: catalog.id }, include: catalogInclude });
      return serializeCatalog(row, row.allProducts ? await activeProductCount() : undefined);
    },
  );

  app.post(
    "/catalogs/:id/regenerate-link",
    { preValidation: [app.guard("products.write", null)], schema: { tags: ["Catalogs"], summary: "Generar un enlace nuevo (el anterior deja de funcionar)", params: idParam, response: { 200: catalogSchema } } },
    async (request) => {
      const before = await app.db.catalog.findUnique({ where: { id: request.params.id } });
      if (!before) throw E.notFound("El catálogo");
      await app.db.catalog.update({ where: { id: before.id }, data: { slug: generateCatalogSlug(before.name) } });
      const row = await app.db.catalog.findUniqueOrThrow({ where: { id: before.id }, include: catalogInclude });
      await audit(app.db, request.actor!, "regenerate_link", "catalog", row.id, { before: { slug: before.slug }, after: { slug: row.slug }, ip: request.ip });
      return serializeCatalog(row, row.allProducts ? await activeProductCount() : undefined);
    },
  );

  app.delete(
    "/catalogs/:id",
    { preValidation: [app.guard("products.write", null)], schema: { tags: ["Catalogs"], summary: "Eliminar catálogo", params: idParam, response: { 200: okResponse } } },
    async (request) => {
      const before = await app.db.catalog.findUnique({ where: { id: request.params.id } });
      if (!before) throw E.notFound("El catálogo");
      await app.db.catalog.delete({ where: { id: before.id } });
      await audit(app.db, request.actor!, "delete", "catalog", before.id, { before, ip: request.ip });
      return { ok: true as const };
    },
  );

  // ---------- Pedidos recibidos desde catálogos ----------

  app.get(
    "/catalog-inquiries",
    {
      preValidation: [app.guard("orders.read", "read:orders")],
      schema: {
        tags: ["Catalogs"],
        summary: "Pedidos enviados a WhatsApp desde catálogos",
        querystring: z.object({ catalog_id: z.string().optional(), status: InquiryStatus.optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }),
        response: { 200: z.object({ data: z.array(catalogInquirySchema) }) },
      },
    },
    async (request) => {
      const { catalog_id, status, limit } = request.query;
      const rows = await app.db.catalogInquiry.findMany({
        where: { ...(catalog_id ? { catalogId: catalog_id } : {}), ...(status ? { status } : {}) },
        include: { catalog: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return { data: rows.map(serializeInquiry) };
    },
  );

  app.get(
    "/catalog-inquiries/:code",
    {
      preValidation: [app.guard("orders.read", "read:orders")],
      schema: { tags: ["Catalogs"], summary: "Pedido de catálogo por código (ej. P-7KQ3XA) o id", params: z.object({ code: z.string() }), response: { 200: catalogInquirySchema } },
    },
    async (request) => {
      const code = request.params.code.trim().toUpperCase().replace(/^P(?!-)/, "P-");
      const row = await app.db.catalogInquiry.findFirst({
        where: { OR: [{ code }, { id: request.params.code }] },
        include: { catalog: { select: { name: true } } },
      });
      if (!row) throw E.notFound("El pedido");
      return serializeInquiry(row);
    },
  );

  app.patch(
    "/catalog-inquiries/:id",
    { preValidation: [app.guard("orders.write", "write:orders")], schema: { tags: ["Catalogs"], summary: "Cambiar estado del pedido de catálogo", params: idParam, body: updateInquiryBody, response: { 200: catalogInquirySchema } } },
    async (request) => {
      const before = await app.db.catalogInquiry.findUnique({ where: { id: request.params.id } });
      if (!before) throw E.notFound("El pedido");
      const row = await app.db.catalogInquiry.update({ where: { id: before.id }, data: { status: request.body.status }, include: { catalog: { select: { name: true } } } });
      await audit(app.db, request.actor!, "update", "catalog_inquiry", row.id, { before: { status: before.status }, after: { status: row.status }, ip: request.ip });
      return serializeInquiry(row);
    },
  );
}
