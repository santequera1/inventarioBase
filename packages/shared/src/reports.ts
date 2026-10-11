import { z } from "zod";

export const reportRangeQuery = z.object({
  from: z.string().optional().describe("YYYY-MM-DD (America/Bogota)"),
  to: z.string().optional().describe("YYYY-MM-DD inclusive"),
  location_id: z.string().optional(),
  group_by: z.enum(["day", "week", "month"]).default("day"),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export const salesSummarySchema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  ordersCount: z.number().int(),
  itemsSold: z.number().int(),
  gross: z.number().int(),
  discounts: z.number().int(),
  returns: z.number().int(),
  net: z.number().int(),
  tax: z.number().int(),
  cost: z.number().int(),
  grossMargin: z.number().int(),
  marginPct: z.number(),
  averageTicket: z.number().int(),
  series: z.array(
    z.object({ period: z.string(), orders: z.number().int(), net: z.number().int(), margin: z.number().int() }),
  ),
  byPaymentMethod: z.array(z.object({ methodCode: z.string(), methodName: z.string(), total: z.number().int() })),
});

export const topProductsSchema = z.array(
  z.object({
    variantId: z.string(),
    sku: z.string(),
    productTitle: z.string(),
    variantTitle: z.string(),
    quantity: z.number().int(),
    net: z.number().int(),
    margin: z.number().int(),
  }),
);

export const inventoryValuationSchema = z.object({
  totalUnits: z.number().int(),
  totalCost: z.number().int(),
  totalRetail: z.number().int(),
  potentialMargin: z.number().int(),
  byLocation: z.array(
    z.object({ locationId: z.string(), locationName: z.string(), units: z.number().int(), cost: z.number().int(), retail: z.number().int() }),
  ),
  byCategory: z.array(
    z.object({ categoryId: z.string().nullable(), categoryName: z.string(), units: z.number().int(), cost: z.number().int(), retail: z.number().int() }),
  ),
});

export const homeSummarySchema = z.object({
  today: z.object({ orders: z.number().int(), net: z.number().int(), items: z.number().int() }),
  yesterday: z.object({ orders: z.number().int(), net: z.number().int() }),
  lowStockCount: z.number().int(),
  outOfStockCount: z.number().int(),
  pendingTransfers: z.number().int(),
  pendingPurchaseOrders: z.number().int(),
  openCashSessions: z.number().int(),
  lowStock: z.array(
    z.object({
      variantId: z.string(),
      locationId: z.string(),
      locationName: z.string(),
      productTitle: z.string(),
      variantTitle: z.string(),
      sku: z.string(),
      available: z.number().int(),
      minStock: z.number().int().nullable(),
      thumbUrl: z.string().nullable(),
    }),
  ),
});
