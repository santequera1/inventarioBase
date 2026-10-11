import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(3300),
  HOST: z.string().default("127.0.0.1"),
  PUBLIC_URL: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  TEST_DATABASE_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET debe tener al menos 32 caracteres"),
  CORS_ORIGINS: z.string().default("*"),
  UPLOADS_DIR: z.string().default("./uploads"),
  LOG_LEVEL: z.string().default("info"),
  API_RATE_LIMIT: z.coerce.number().int().default(600),
  WEBHOOK_POLL_MS: z.coerce.number().int().default(5000),
});

export type Config = z.infer<typeof envSchema> & {
  corsOrigins: string[] | "*";
  isProd: boolean;
  isTest: boolean;
};

export function loadConfig(overrides: Partial<Record<string, string>> = {}): Config {
  const parsed = envSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuración inválida: ${msg}`);
  }
  const env = parsed.data;
  const corsOrigins =
    env.CORS_ORIGINS.trim() === "*"
      ? ("*" as const)
      : env.CORS_ORIGINS.split(",")
          .map((s) => s.trim())
          .filter(Boolean);
  return { ...env, corsOrigins, isProd: env.NODE_ENV === "production", isTest: env.NODE_ENV === "test" };
}

export const SESSION_COOKIE = "iw_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const API_KEY_PREFIX = "iw_live_";
