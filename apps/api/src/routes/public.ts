import { z } from "zod";
import { publicCatalogResponse, publicCheckoutBody, publicCheckoutResponse } from "@inventario/shared";
import { Prisma } from "@prisma/client";
import type { App } from "../app";
import { E } from "../lib/errors";
import { availableByVariant, buildPublicProducts, buildWhatsappMessage, generateInquiryCode, whatsappUrl, type InquiryLine } from "../services/catalogs";

const slugParam = z.object({ slug: z.string().min(1).max(80) });

/** Rutas sin autenticación para los catálogos compartidos por enlace. */
export default async function publicRoutes(app: App) {
  const findCatalog = async (slug: string) => {
    const c = await app.db.catalog.findUnique({ where: { slug } });
    if (!c || !c.active) throw E.notFound("El catálogo");
    return c;
  };

  app.get(
    "/catalogs/:slug",
    { schema: { tags: ["Public"], summary: "Catálogo público", params: slugParam, response: { 200: publicCatalogResponse } } },
    async (request, reply) => {
      const catalog = await findCatalog(request.params.slug);
      const [settings, products] = await Promise.all([app.settings(), buildPublicProducts(app.db, catalog)]);
      app.db.catalog.update({ where: { id: catalog.id }, data: { views: { increment: 1 } } }).catch(() => undefined);
      reply.header("cache-control", "no-store");
      return {
        catalog: { name: catalog.name, slug: catalog.slug, description: catalog.description, showStock: catalog.showStock, logoUrl: catalog.logoUrl, logoInvert: catalog.logoInvert },
        store: { name: settings.name, city: settings.city, address: settings.address },
        products,
      };
    },
  );

  app.post(
    "/catalogs/:slug/checkout",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: { tags: ["Public"], summary: "Registrar carrito y obtener el enlace de WhatsApp", params: slugParam, body: publicCheckoutBody, response: { 200: publicCheckoutResponse } },
    },
    async (request) => {
      const catalog = await findCatalog(request.params.slug);
      // Agrupa líneas repetidas de la misma variante.
      const qty = new Map<string, number>();
      for (const i of request.body.items) qty.set(i.variantId, (qty.get(i.variantId) ?? 0) + i.quantity);
      const ids = [...qty.keys()];

      const variants = await app.db.variant.findMany({
        where: {
          id: { in: ids },
          active: true,
          product: { status: "ACTIVE", ...(catalog.allProducts ? {} : { catalogItems: { some: { catalogId: catalog.id } } }) },
        },
        include: { product: { select: { id: true, title: true } } },
      });
      if (variants.length !== ids.length) {
        throw E.conflict("Algunos productos del carrito ya no están disponibles en este catálogo. Actualiza la página e inténtalo de nuevo.");
      }
      const stock = await availableByVariant(app.db, catalog, ids);
      const byId = new Map(variants.map((v) => [v.id, v]));
      const lines: InquiryLine[] = [];
      for (const id of ids) {
        const v = byId.get(id)!;
        const q = qty.get(id)!;
        const label = v.title !== "Default" ? `${v.product.title} (${v.title})` : v.product.title;
        if (v.trackInventory) {
          const available = stock.get(id) ?? 0;
          if (available <= 0) throw E.insufficientStock(`${label} está agotado.`, { variantId: id });
          if (q > available) throw E.insufficientStock(`Solo hay ${available} unidad(es) de ${label}.`, { variantId: id, available });
        }
        lines.push({ variantId: id, productId: v.product.id, productTitle: v.product.title, variantTitle: v.title, sku: v.sku, quantity: q, unitPrice: v.price, total: v.price * q });
      }
      const total = lines.reduce((a, l) => a + l.total, 0);
      const itemCount = lines.reduce((a, l) => a + l.quantity, 0);
      const customerName = request.body.customerName || undefined;
      const note = request.body.note || undefined;

      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateInquiryCode();
        const message = buildWhatsappMessage({ catalogName: catalog.name, intro: catalog.messageIntro, code, lines, total, customerName, note });
        try {
          await app.db.catalogInquiry.create({
            data: { code, catalogId: catalog.id, customerName: customerName ?? null, customerNote: note ?? null, items: lines, itemCount, total, message },
          });
          return { code, message, total, whatsappUrl: whatsappUrl(catalog.whatsappPhone, message) };
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
          throw err;
        }
      }
      throw E.internal();
    },
  );
}
