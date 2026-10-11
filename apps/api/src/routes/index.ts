import fp from "fastify-plugin";
import { z } from "zod";
import type { App } from "../app";
import authRoutes from "./auth";
import settingsRoutes from "./v1/settings";
import locationRoutes from "./v1/locations";
import categoryRoutes from "./v1/categories";
import supplierRoutes from "./v1/suppliers";
import reasonRoutes from "./v1/reasons";
import paymentMethodRoutes from "./v1/payment-methods";
import productRoutes from "./v1/products";
import inventoryRoutes from "./v1/inventory";
import transferRoutes from "./v1/transfers";
import countRoutes from "./v1/counts";
import purchaseOrderRoutes from "./v1/purchase-orders";
import customerRoutes from "./v1/customers";
import orderRoutes from "./v1/orders";
import cashRoutes from "./v1/cash-sessions";
import reportRoutes from "./v1/reports";
import userRoutes from "./v1/users";
import apiKeyRoutes from "./v1/api-keys";
import webhookRoutes from "./v1/webhooks";
import auditRoutes from "./v1/audit";
import savedViewRoutes from "./v1/saved-views";
import uploadRoutes from "./v1/uploads";
import importRoutes from "./v1/imports";

export const registerRoutes = fp(async (fastify) => {
  const app = fastify as unknown as App;

  app.get(
    "/api/health",
    {
      schema: {
        tags: ["System"],
        summary: "Healthcheck",
        response: { 200: z.object({ status: z.literal("ok"), db: z.literal("ok"), time: z.string(), version: z.string() }) },
      },
    },
    async () => {
      await app.db.$queryRaw`SELECT 1`;
      return { status: "ok" as const, db: "ok" as const, time: new Date().toISOString(), version: "1.0.0" };
    },
  );

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(
    async (v1) => {
      const v = v1 as unknown as App;
      await v.register(settingsRoutes);
      await v.register(locationRoutes);
      await v.register(categoryRoutes);
      await v.register(supplierRoutes);
      await v.register(reasonRoutes);
      await v.register(paymentMethodRoutes);
      await v.register(productRoutes);
      await v.register(inventoryRoutes);
      await v.register(transferRoutes);
      await v.register(countRoutes);
      await v.register(purchaseOrderRoutes);
      await v.register(customerRoutes);
      await v.register(orderRoutes);
      await v.register(cashRoutes);
      await v.register(reportRoutes);
      await v.register(userRoutes);
      await v.register(apiKeyRoutes);
      await v.register(webhookRoutes);
      await v.register(auditRoutes);
      await v.register(savedViewRoutes);
      await v.register(uploadRoutes);
      await v.register(importRoutes);
    },
    { prefix: "/api/v1" },
  );
});
