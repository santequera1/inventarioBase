import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import type { PrismaClient, StoreSettings } from "@prisma/client";
import { loadConfig, type Config } from "./config";
import { createPrisma } from "./lib/prisma";
import { problemFromError, sendProblem } from "./lib/errors";
import authPlugin from "./plugins/auth";
import idempotencyPlugin from "./plugins/idempotency";
import openapiPlugin from "./plugins/openapi";
import { WebhookService } from "./services/webhooks";
import { registerRoutes } from "./routes";

declare module "fastify" {
  interface FastifyInstance {
    config: Config;
    db: PrismaClient;
    webhooks: WebhookService;
    /** Configuración de tienda (cacheada 10 s). */
    settings: () => Promise<StoreSettings>;
    invalidateSettings: () => void;
  }
}

export type App = FastifyInstance<any, any, any, any, ZodTypeProvider>;

export async function buildApp(opts: { config?: Config; db?: PrismaClient; logger?: boolean } = {}): Promise<App> {
  const config = opts.config ?? loadConfig();
  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : {
            level: config.LOG_LEVEL,
            ...(config.isProd || config.isTest
              ? {}
              : { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } } }),
            redact: ["req.headers.authorization", "req.headers.cookie", "req.headers['x-api-key']"],
          },
    trustProxy: true,
    bodyLimit: 5 * 1024 * 1024,
    ajv: { customOptions: { removeAdditional: false } },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate("config", config);
  const db = opts.db ?? createPrisma(config.DATABASE_URL);
  app.decorate("db", db);

  let settingsCache: { value: StoreSettings; at: number } | null = null;
  app.decorate("settings", async () => {
    if (settingsCache && Date.now() - settingsCache.at < 10_000) return settingsCache.value;
    let s = await db.storeSettings.findUnique({ where: { id: 1 } });
    if (!s) s = await db.storeSettings.create({ data: { id: 1 } });
    settingsCache = { value: s, at: Date.now() };
    return s;
  });
  app.decorate("invalidateSettings", () => {
    settingsCache = null;
  });

  const webhooks = new WebhookService(db, app.log, config.WEBHOOK_POLL_MS);
  app.decorate("webhooks", webhooks);

  app.setErrorHandler((err, request, reply) => {
    const { status, body } = problemFromError(err, request, config.PUBLIC_URL);
    return sendProblem(reply, status, body);
  });
  app.setNotFoundHandler((request, reply) =>
    sendProblem(reply, 404, {
      type: `${config.PUBLIC_URL}/api/docs/errors#not-found`,
      title: "No encontrado",
      status: 404,
      detail: `No existe la ruta ${request.method} ${request.url}.`,
      instance: request.url,
    }),
  );

  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(cors, {
    origin: config.corsOrigins === "*" ? true : config.corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Api-Key", "Idempotency-Key"],
    exposedHeaders: ["Idempotent-Replayed", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "Content-Disposition"],
  });
  await app.register(rateLimit, {
    global: true,
    max: (request) => {
      if (request.routeOptions?.config?.strictRateLimit) return 15;
      return request.actor?.type === "API_KEY" ? config.API_RATE_LIMIT : 3000;
    },
    timeWindow: "1 minute",
    keyGenerator: (request) => (request.actor?.type === "API_KEY" ? `ak:${request.actor.id}` : `ip:${request.ip}`),
    skipOnError: true,
    allowList: config.isTest ? () => true : undefined,
  });
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 10 } });

  const uploadsDir = path.resolve(config.UPLOADS_DIR);
  fs.mkdirSync(path.join(uploadsDir, "products"), { recursive: true });
  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: "/uploads/",
    decorateReply: false,
    cacheControl: true,
    maxAge: "30d",
    immutable: true,
  });

  await app.register(authPlugin);
  await app.register(idempotencyPlugin);
  await app.register(openapiPlugin);
  await app.register(registerRoutes);

  app.addHook("onReady", async () => {
    if (!config.isTest) webhooks.start();
  });
  app.addHook("onClose", async () => {
    webhooks.stop();
    if (!opts.db) await db.$disconnect();
  });

  return app;
}
