import { z } from "zod";
import { homeSummarySchema, inventoryValuationSchema, reportRangeQuery, salesSummarySchema, topProductsSchema } from "@inventario/shared";
import type { App } from "../../app";
import { Prisma } from "../../lib/prisma";
import { parseRange, startOfBogotaDay, endOfBogotaDay } from "../../lib/dates";
import { toBogotaDateString } from "@inventario/shared";
import { toCsv } from "../../lib/csv";

const TZ = "America/Bogota";

export default async function reportRoutes(app: App) {
  app.get(
    "/reports/sales",
    { preValidation: [app.guard("reports.read", "read:reports")], schema: { tags: ["Reports"], summary: "Ventas por periodo (neto, margen, IVA, métodos de pago)", querystring: reportRangeQuery, response: { 200: salesSummarySchema } } },
    async (request) => {
      const { from, to, fromStr, toStr } = parseRange(request.query.from, request.query.to);
      const loc = request.query.location_id;
      const locSql = loc ? Prisma.sql`AND o."locationId" = ${loc}` : Prisma.empty;
      const trunc = request.query.group_by === "month" ? "month" : request.query.group_by === "week" ? "week" : "day";
      const [agg] = await app.db.$queryRaw<{ orders: bigint; items: bigint; gross: bigint; discounts: bigint; refunded: bigint; tax: bigint; cost: bigint }[]>`
        SELECT COUNT(*)::bigint AS orders,
               COALESCE(SUM((SELECT SUM(quantity) FROM "OrderLine" l WHERE l."orderId" = o.id)),0)::bigint AS items,
               COALESCE(SUM(o.total),0)::bigint AS gross,
               COALESCE(SUM(o."discountTotal"),0)::bigint AS discounts,
               COALESCE(SUM(o."refundedTotal"),0)::bigint AS refunded,
               COALESCE(SUM(o."taxTotal"),0)::bigint AS tax,
               COALESCE(SUM(o."costTotal"),0)::bigint AS cost
        FROM "Order" o WHERE o.status = 'COMPLETED' AND o."createdAt" BETWEEN ${from} AND ${to} ${locSql}`;
      const series = await app.db.$queryRaw<{ period: Date; orders: bigint; net: bigint; margin: bigint }[]>`
        SELECT date_trunc(${trunc}, o."createdAt" AT TIME ZONE ${TZ}) AS period, COUNT(*)::bigint AS orders,
               COALESCE(SUM(o.total - o."refundedTotal"),0)::bigint AS net,
               COALESCE(SUM(o.total - o."refundedTotal" - o."taxTotal" - o."costTotal"),0)::bigint AS margin
        FROM "Order" o WHERE o.status = 'COMPLETED' AND o."createdAt" BETWEEN ${from} AND ${to} ${locSql}
        GROUP BY 1 ORDER BY 1`;
      const byMethod = await app.db.$queryRaw<{ methodCode: string; methodName: string; total: bigint }[]>`
        SELECT p."methodCode", p."methodName", COALESCE(SUM(CASE WHEN p.kind = 'PAYMENT' THEN p.amount ELSE -p.amount END),0)::bigint AS total
        FROM "OrderPayment" p JOIN "Order" o ON o.id = p."orderId"
        WHERE o."createdAt" BETWEEN ${from} AND ${to} ${locSql}
        GROUP BY 1,2 ORDER BY 3 DESC`;
      const gross = Number(agg?.gross ?? 0);
      const returns = Number(agg?.refunded ?? 0);
      const net = gross - returns;
      const tax = Number(agg?.tax ?? 0);
      const cost = Number(agg?.cost ?? 0);
      const grossMargin = net - tax - cost;
      const ordersCount = Number(agg?.orders ?? 0);
      return {
        range: { from: fromStr, to: toStr },
        ordersCount,
        itemsSold: Number(agg?.items ?? 0),
        gross,
        discounts: Number(agg?.discounts ?? 0),
        returns,
        net,
        tax,
        cost,
        grossMargin,
        marginPct: net - tax > 0 ? Math.round((grossMargin / (net - tax)) * 1000) / 10 : 0,
        averageTicket: ordersCount ? Math.round(gross / ordersCount) : 0,
        series: series.map((s) => ({ period: toBogotaDateString(new Date(s.period.getTime() + 5 * 3600_000)), orders: Number(s.orders), net: Number(s.net), margin: Number(s.margin) })),
        byPaymentMethod: byMethod.map((m) => ({ methodCode: m.methodCode, methodName: m.methodName, total: Number(m.total) })),
      };
    },
  );

  app.get(
    "/reports/top-products",
    { preValidation: [app.guard("reports.read", "read:reports")], schema: { tags: ["Reports"], summary: "Más vendidos", querystring: reportRangeQuery, response: { 200: topProductsSchema } } },
    async (request) => {
      const { from, to } = parseRange(request.query.from, request.query.to);
      const loc = request.query.location_id;
      const rows = await app.db.$queryRaw<{ variantId: string; sku: string; productTitle: string; variantTitle: string; quantity: bigint; net: bigint; margin: bigint }[]>`
        SELECT COALESCE(l."variantId", l.sku) AS "variantId", l.sku, l."productTitle", l."variantTitle",
               SUM(l.quantity - l."returnedQuantity")::bigint AS quantity,
               SUM((l.total - l."taxAmount") * (l.quantity - l."returnedQuantity") / GREATEST(l.quantity,1))::bigint AS net,
               SUM((l.total - l."taxAmount" - l."unitCost" * l.quantity) * (l.quantity - l."returnedQuantity") / GREATEST(l.quantity,1))::bigint AS margin
        FROM "OrderLine" l JOIN "Order" o ON o.id = l."orderId"
        WHERE o.status = 'COMPLETED' AND o."createdAt" BETWEEN ${from} AND ${to} ${loc ? Prisma.sql`AND o."locationId" = ${loc}` : Prisma.empty}
        GROUP BY 1,2,3,4 ORDER BY quantity DESC LIMIT ${request.query.limit}`;
      return rows.map((r) => ({ ...r, quantity: Number(r.quantity), net: Number(r.net), margin: Number(r.margin) }));
    },
  );

  app.get(
    "/reports/inventory-valuation",
    { preValidation: [app.guard("reports.read", "read:reports")], schema: { tags: ["Reports"], summary: "Valorización del inventario (a costo y a precio)", querystring: z.object({ location_id: z.string().optional() }), response: { 200: inventoryValuationSchema } } },
    async (request) => {
      const loc = request.query.location_id;
      const locSql = loc ? Prisma.sql`AND il."locationId" = ${loc}` : Prisma.empty;
      const base = Prisma.sql`FROM "InventoryLevel" il JOIN "Variant" v ON v.id = il."variantId" JOIN "Product" p ON p.id = v."productId" JOIN "Location" loc ON loc.id = il."locationId" LEFT JOIN "Category" c ON c.id = p."categoryId" WHERE p.status <> 'ARCHIVED' ${locSql}`;
      const onHand = Prisma.sql`(il.available + il.committed + il.unavailable)`;
      const [tot] = await app.db.$queryRaw<{ units: bigint; cost: bigint; retail: bigint }[]>`SELECT COALESCE(SUM(${onHand}),0)::bigint AS units, COALESCE(SUM(${onHand} * COALESCE(v.cost,0)),0)::bigint AS cost, COALESCE(SUM(${onHand} * v.price),0)::bigint AS retail ${base}`;
      const byLocation = await app.db.$queryRaw<{ locationId: string; locationName: string; units: bigint; cost: bigint; retail: bigint }[]>`SELECT loc.id AS "locationId", loc.name AS "locationName", COALESCE(SUM(${onHand}),0)::bigint AS units, COALESCE(SUM(${onHand} * COALESCE(v.cost,0)),0)::bigint AS cost, COALESCE(SUM(${onHand} * v.price),0)::bigint AS retail ${base} GROUP BY 1,2 ORDER BY 2`;
      const byCategory = await app.db.$queryRaw<{ categoryId: string | null; categoryName: string | null; units: bigint; cost: bigint; retail: bigint }[]>`SELECT c.id AS "categoryId", c.name AS "categoryName", COALESCE(SUM(${onHand}),0)::bigint AS units, COALESCE(SUM(${onHand} * COALESCE(v.cost,0)),0)::bigint AS cost, COALESCE(SUM(${onHand} * v.price),0)::bigint AS retail ${base} GROUP BY 1,2 ORDER BY cost DESC`;
      const n = (x: bigint) => Number(x);
      return {
        totalUnits: n(tot?.units ?? 0n), totalCost: n(tot?.cost ?? 0n), totalRetail: n(tot?.retail ?? 0n), potentialMargin: n(tot?.retail ?? 0n) - n(tot?.cost ?? 0n),
        byLocation: byLocation.map((r) => ({ locationId: r.locationId, locationName: r.locationName, units: n(r.units), cost: n(r.cost), retail: n(r.retail) })),
        byCategory: byCategory.map((r) => ({ categoryId: r.categoryId, categoryName: r.categoryName ?? "Sin categoría", units: n(r.units), cost: n(r.cost), retail: n(r.retail) })),
      };
    },
  );

  const stockRow = z.object({ variantId: z.string(), sku: z.string(), productTitle: z.string(), variantTitle: z.string(), locationName: z.string(), available: z.number().int(), onHand: z.number().int(), minStock: z.number().int().nullable(), lastMovementAt: z.string().nullable(), soldLast30: z.number().int(), rotation: z.number().nullable(), cost: z.number().int().nullable(), price: z.number().int() });

  app.get(
    "/reports/stock",
    {
      preValidation: [app.guard("reports.read", "read:reports")],
      schema: { tags: ["Reports"], summary: "Stock bajo, sin movimiento y rotación", querystring: z.object({ kind: z.enum(["low_stock", "no_movement", "rotation"]).default("low_stock"), location_id: z.string().optional(), days: z.coerce.number().int().min(1).max(365).default(30), limit: z.coerce.number().int().min(1).max(500).default(100), format: z.enum(["json", "csv"]).default("json") }), response: { 200: z.array(stockRow) } },
    },
    async (request, reply) => {
      const settings = await app.settings();
      const { kind, location_id, days, limit } = request.query;
      const since = new Date(Date.now() - days * 86400_000);
      const locSql = location_id ? Prisma.sql`AND il."locationId" = ${location_id}` : Prisma.empty;
      const rows = await app.db.$queryRaw<{ variantId: string; sku: string; productTitle: string; variantTitle: string; locationName: string; available: number; onHand: number; minStock: number | null; lastMovementAt: Date | null; soldLast30: bigint; cost: number | null; price: number }[]>`
        SELECT il."variantId", v.sku, p.title AS "productTitle", v.title AS "variantTitle", loc.name AS "locationName", il.available, (il.available + il.committed + il.unavailable) AS "onHand", il."minStock",
               (SELECT MAX(m."createdAt") FROM "InventoryMovement" m WHERE m."variantId" = il."variantId" AND m."locationId" = il."locationId" AND m.type IN ('SALE','RECEIPT','TRANSFER_IN','TRANSFER_OUT')) AS "lastMovementAt",
               COALESCE((SELECT SUM(-m.quantity) FROM "InventoryMovement" m WHERE m."variantId" = il."variantId" AND m."locationId" = il."locationId" AND m.type = 'SALE' AND m."createdAt" >= ${since}),0)::bigint AS "soldLast30",
               v.cost, v.price
        FROM "InventoryLevel" il JOIN "Variant" v ON v.id = il."variantId" JOIN "Product" p ON p.id = v."productId" JOIN "Location" loc ON loc.id = il."locationId"
        WHERE p.status = 'ACTIVE' AND v.active ${locSql}
        ${kind === "low_stock" ? Prisma.sql`AND il.available <= COALESCE(il."minStock", ${settings.lowStockThreshold}) ORDER BY il.available ASC, p.title` : Prisma.empty}
        ${kind === "no_movement" ? Prisma.sql`AND (il.available + il.committed + il.unavailable) > 0 AND NOT EXISTS (SELECT 1 FROM "InventoryMovement" m WHERE m."variantId" = il."variantId" AND m."locationId" = il."locationId" AND m.type = 'SALE' AND m."createdAt" >= ${since}) ORDER BY "onHand" DESC` : Prisma.empty}
        ${kind === "rotation" ? Prisma.sql`ORDER BY "soldLast30" DESC` : Prisma.empty}
        LIMIT ${limit}`;
      const out = rows.map((r) => {
        const sold = Number(r.soldLast30);
        const avgStock = (r.onHand + Math.max(0, r.onHand + sold)) / 2;
        return { ...r, soldLast30: sold, rotation: avgStock > 0 ? Math.round((sold / avgStock) * 100) / 100 : null, lastMovementAt: r.lastMovementAt?.toISOString() ?? null };
      });
      if (request.query.format === "csv") {
        const csv = toCsv(["Producto", "Variante", "SKU", "Ubicación", "Disponible", "En existencia", "Stock mínimo", "Vendidos periodo", "Rotación", "Último movimiento", "Costo", "Precio"], out.map((r) => [r.productTitle, r.variantTitle, r.sku, r.locationName, r.available, r.onHand, r.minStock ?? "", r.soldLast30, r.rotation ?? "", r.lastMovementAt ?? "", r.cost ?? "", r.price]));
        reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="reporte-${kind}.csv"`);
        return reply.send(csv as unknown as never);
      }
      return out;
    },
  );

  app.get(
    "/reports/home",
    { preValidation: [app.guard("inventory.read", "read:reports")], schema: { tags: ["Reports"], summary: "Resumen para la pantalla de inicio", querystring: z.object({ location_id: z.string().optional() }), response: { 200: homeSummarySchema } } },
    async (request) => {
      const settings = await app.settings();
      const loc = request.query.location_id;
      const todayStr = toBogotaDateString();
      const y = new Date(startOfBogotaDay(todayStr).getTime() - 86400_000);
      const yStr = toBogotaDateString(y);
      const whereBase = { status: "COMPLETED", ...(loc ? { locationId: loc } : {}) };
      const [today, yesterday, todayItems, lowStock, counts, pendingTransfers, pendingPO, openCash] = await Promise.all([
        app.db.order.aggregate({ where: { ...whereBase, createdAt: { gte: startOfBogotaDay(todayStr), lte: endOfBogotaDay(todayStr) } }, _count: true, _sum: { total: true, refundedTotal: true } }),
        app.db.order.aggregate({ where: { ...whereBase, createdAt: { gte: startOfBogotaDay(yStr), lte: endOfBogotaDay(yStr) } }, _count: true, _sum: { total: true, refundedTotal: true } }),
        app.db.orderLine.aggregate({ where: { order: { ...whereBase, createdAt: { gte: startOfBogotaDay(todayStr), lte: endOfBogotaDay(todayStr) } } }, _sum: { quantity: true } }),
        app.db.$queryRaw<{ variantId: string; locationId: string; locationName: string; productTitle: string; variantTitle: string; sku: string; available: number; minStock: number | null; thumbPath: string | null }[]>`
          SELECT il."variantId", il."locationId", loc.name AS "locationName", p.title AS "productTitle", v.title AS "variantTitle", v.sku, il.available, il."minStock",
                 COALESCE((SELECT i."thumbPath" FROM "ProductImage" i WHERE i.id = v."imageId"), (SELECT i."thumbPath" FROM "ProductImage" i WHERE i."productId" = p.id ORDER BY i.position LIMIT 1)) AS "thumbPath"
          FROM "InventoryLevel" il JOIN "Variant" v ON v.id = il."variantId" JOIN "Product" p ON p.id = v."productId" JOIN "Location" loc ON loc.id = il."locationId"
          WHERE p.status = 'ACTIVE' AND v.active AND il.available <= COALESCE(il."minStock", ${settings.lowStockThreshold}) ${loc ? Prisma.sql`AND il."locationId" = ${loc}` : Prisma.empty}
          ORDER BY il.available ASC, p.title LIMIT 8`,
        app.db.$queryRaw<{ low: bigint; out: bigint }[]>`
          SELECT COUNT(*) FILTER (WHERE il.available > 0 AND il.available <= COALESCE(il."minStock", ${settings.lowStockThreshold}))::bigint AS low,
                 COUNT(*) FILTER (WHERE il.available <= 0)::bigint AS out
          FROM "InventoryLevel" il JOIN "Variant" v ON v.id = il."variantId" JOIN "Product" p ON p.id = v."productId"
          WHERE p.status = 'ACTIVE' AND v.active ${loc ? Prisma.sql`AND il."locationId" = ${loc}` : Prisma.empty}`,
        app.db.transfer.count({ where: { status: { in: ["PENDING", "IN_TRANSIT"] } } }),
        app.db.purchaseOrder.count({ where: { status: { in: ["ORDERED", "PARTIAL"] } } }),
        app.db.cashSession.count({ where: { status: "OPEN", ...(loc ? { locationId: loc } : {}) } }),
      ]);
      return {
        today: { orders: today._count, net: (today._sum.total ?? 0) - (today._sum.refundedTotal ?? 0), items: todayItems._sum.quantity ?? 0 },
        yesterday: { orders: yesterday._count, net: (yesterday._sum.total ?? 0) - (yesterday._sum.refundedTotal ?? 0) },
        lowStockCount: Number(counts[0]?.low ?? 0),
        outOfStockCount: Number(counts[0]?.out ?? 0),
        pendingTransfers,
        pendingPurchaseOrders: pendingPO,
        openCashSessions: openCash,
        lowStock: lowStock.map((r) => ({ ...r, thumbUrl: r.thumbPath ? `/uploads/${r.thumbPath}` : null })),
      };
    },
  );
}
