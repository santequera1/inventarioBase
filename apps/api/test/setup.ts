import { execSync } from "node:child_process";
import { beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { loadConfig } from "../src/config";
import { buildApp, type App } from "../src/app";
import { seedBase } from "../prisma/seed";

const envFile = new URL("../../../.env", import.meta.url).pathname;
try {
  const text = (await import("node:fs")).readFileSync(envFile, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
} catch {
  /* sin .env */
}
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("TEST_DATABASE_URL es obligatoria para los tests");

export const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: testUrl, CORS_ORIGINS: "*", LOG_LEVEL: "silent", UPLOADS_DIR: "/tmp/iw-test-uploads" });
export const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
export let app: App;

export const ADMIN = { email: "admin@test.local", password: "Test1234!" };

beforeAll(async () => {
  execSync("npx prisma migrate deploy", { cwd: new URL("..", import.meta.url).pathname, env: { ...process.env, DATABASE_URL: testUrl }, stdio: "ignore" });
  await resetDb();
  await seedBase(db, { adminEmail: ADMIN.email, adminPassword: ADMIN.password, adminName: "Admin Test" });
  app = await buildApp({ config, db, logger: false });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await db.$disconnect();
});

export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

/** Inicia sesión y devuelve el header cookie. */
export async function loginCookie(email = ADMIN.email, password = ADMIN.password): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`login falló: ${res.body}`);
  const setCookie = res.headers["set-cookie"];
  const raw = Array.isArray(setCookie) ? setCookie[0]! : (setCookie as string);
  return raw.split(";")[0]!;
}

export async function createApiKey(cookie: string, scopes: string[]): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/v1/api-keys", headers: { cookie }, payload: { name: "test", scopes } });
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json().token as string;
}

export async function defaultLocation() {
  return db.location.findFirstOrThrow({ where: { isDefault: true } });
}

let skuCounter = 0;
export async function createProduct(cookie: string, opts: { stock?: number; price?: number; cost?: number; taxRate?: 0 | 5 | 19; variants?: number } = {}) {
  const loc = await defaultLocation();
  const n = opts.variants ?? 1;
  const variants = Array.from({ length: n }, (_, i) => ({
    sku: `TST-${Date.now().toString(36)}-${skuCounter++}-${i}`,
    price: opts.price ?? 10000,
    cost: opts.cost ?? 4000,
    optionValues: n > 1 ? { Talla: ["S", "M", "L", "XL"][i] ?? String(i) } : {},
    initialStock: opts.stock !== undefined ? [{ locationId: loc.id, available: opts.stock }] : undefined,
  }));
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/products",
    headers: { cookie },
    payload: { title: `Producto ${skuCounter}`, taxRate: opts.taxRate ?? 19, options: n > 1 ? [{ name: "Talla", values: ["S", "M", "L", "XL"].slice(0, n) }] : [], variants },
  });
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json() as { id: string; variants: { id: string; sku: string }[] };
}

export async function level(variantId: string, locationId: string) {
  const l = await db.inventoryLevel.findUnique({ where: { variantId_locationId: { variantId, locationId } } });
  return l ?? { available: 0, committed: 0, unavailable: 0, incoming: 0 };
}
