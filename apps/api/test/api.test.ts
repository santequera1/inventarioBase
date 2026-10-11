import { describe, it, expect, beforeAll } from "vitest";
import http from "node:http";
import { app, createApiKey, createProduct, defaultLocation, loginCookie, db, level } from "./setup";
import { signWebhook } from "../src/lib/crypto";

let cookie: string;
beforeAll(async () => {
  cookie = await loginCookie();
});

describe("idempotencia", () => {
  it("misma Idempotency-Key → una sola orden; cuerpo distinto → 422", async () => {
    const loc = await defaultLocation();
    const p = await createProduct(cookie, { stock: 10, price: 10000 });
    const token = await createApiKey(cookie, ["write:orders", "read:orders"]);
    const headers = { authorization: `Bearer ${token}`, "idempotency-key": `key-${Date.now()}` };
    const payload = { locationId: loc.id, items: [{ variantId: p.variants[0]!.id, quantity: 1 }], payments: [{ methodCode: "cash", amount: 10000 }] };
    const r1 = await app.inject({ method: "POST", url: "/api/v1/orders", headers, payload });
    const r2 = await app.inject({ method: "POST", url: "/api/v1/orders", headers, payload });
    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);
    expect(r2.headers["idempotent-replayed"]).toBe("true");
    expect(r1.json().id).toBe(r2.json().id);
    expect(r1.json().source).toBe("API");
    expect((await level(p.variants[0]!.id, loc.id)).available).toBe(9);
    const r3 = await app.inject({ method: "POST", url: "/api/v1/orders", headers, payload: { ...payload, items: [{ variantId: p.variants[0]!.id, quantity: 2 }] } });
    expect(r3.statusCode).toBe(422);
    expect(r3.json().type).toContain("idempotency-key-reused");
  });

  it("peticiones concurrentes con la misma clave crean una sola orden", async () => {
    const loc = await defaultLocation();
    const p = await createProduct(cookie, { stock: 10, price: 10000 });
    const headers = { cookie, "idempotency-key": `conc-${Date.now()}` };
    const payload = { locationId: loc.id, items: [{ variantId: p.variants[0]!.id, quantity: 1 }], payments: [{ methodCode: "cash", amount: 10000 }] };
    const results = await Promise.all(Array.from({ length: 4 }, () => app.inject({ method: "POST", url: "/api/v1/orders", headers, payload })));
    const created = results.filter((r) => r.statusCode === 201 && r.headers["idempotent-replayed"] !== "true");
    expect(created).toHaveLength(1);
    expect((await level(p.variants[0]!.id, loc.id)).available).toBe(9);
  });
});

describe("API keys y scopes", () => {
  it("sin scope → 403; con scope → 200; revocada → 401", async () => {
    const token = await createApiKey(cookie, ["read:products"]);
    let res = await app.inject({ method: "GET", url: "/api/v1/products", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    res = await app.inject({ method: "GET", url: "/api/v1/inventory-levels", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    expect(res.json().detail).toContain("read:inventory");
    res = await app.inject({ method: "GET", url: "/api/v1/users", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    const keys = await app.inject({ method: "GET", url: "/api/v1/api-keys", headers: { cookie } });
    const k = keys.json().data.find((x: { prefix: string }) => token.includes(x.prefix));
    await app.inject({ method: "POST", url: `/api/v1/api-keys/${k.id}/revoke`, headers: { cookie } });
    res = await app.inject({ method: "GET", url: "/api/v1/products", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
    res = await app.inject({ method: "GET", url: "/api/v1/products", headers: { authorization: "Bearer iw_live_xxxx.yyyy" } });
    expect(res.statusCode).toBe(401);
  });

  it("los permisos de rol se aplican a usuarios de sesión", async () => {
    const roles = await app.inject({ method: "GET", url: "/api/v1/roles", headers: { cookie } });
    const vendedor = roles.json().data.find((r: { name: string }) => r.name === "VENDEDOR");
    await app.inject({ method: "POST", url: "/api/v1/users", headers: { cookie }, payload: { email: "vendedor@test.local", name: "Vendedor", password: "Vende1234!", roleId: vendedor.id } });
    const vcookie = await loginCookie("vendedor@test.local", "Vende1234!");
    let res = await app.inject({ method: "GET", url: "/api/v1/products", headers: { cookie: vcookie } });
    expect(res.statusCode).toBe(200);
    res = await app.inject({ method: "POST", url: "/api/v1/inventory-adjustments", headers: { cookie: vcookie }, payload: { variantId: "x", locationId: "y", mode: "delta", quantity: 1, reason: "Ajuste de prueba" } });
    expect(res.statusCode).toBe(403);
    res = await app.inject({ method: "GET", url: "/api/v1/users", headers: { cookie: vcookie } });
    expect(res.statusCode).toBe(403);
  });

  it("paginación por cursor y upsert masivo por SKU", async () => {
    const token = await createApiKey(cookie, ["read:products", "write:products"]);
    const auth = { authorization: `Bearer ${token}` };
    const sku = `BULK-${Date.now()}`;
    let res = await app.inject({ method: "POST", url: "/api/v1/products/bulk", headers: auth, payload: { products: [{ title: "Bulk A", variants: [{ sku, price: 1000 }] }, { title: "Bulk B", variants: [{ sku: `${sku}-B`, price: 2000 }] }] } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ created: 2, updated: 0 });
    res = await app.inject({ method: "POST", url: "/api/v1/products/bulk", headers: auth, payload: { products: [{ title: "Bulk A renombrado", variants: [{ sku, price: 1500 }] }] } });
    expect(res.json()).toMatchObject({ created: 0, updated: 1 });
    res = await app.inject({ method: "GET", url: `/api/v1/products?sku=${sku}`, headers: auth });
    expect(res.json().data[0].title).toBe("Bulk A renombrado");
    expect(res.json().data[0].variants[0].price).toBe(1500);

    res = await app.inject({ method: "GET", url: "/api/v1/products?limit=1", headers: auth });
    expect(res.json().data).toHaveLength(1);
    expect(res.json().meta.has_more).toBe(true);
    const next = res.json().meta.next_cursor;
    const res2 = await app.inject({ method: "GET", url: `/api/v1/products?limit=1&cursor=${next}`, headers: auth });
    expect(res2.json().data[0].id).not.toBe(res.json().data[0].id);
  });

  it("errores siguen RFC 7807 y la OpenAPI se sirve", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.json()).toMatchObject({ status: 404, title: "No encontrado" });
    const spec = await app.inject({ method: "GET", url: "/api/openapi.json" });
    expect(spec.json().openapi).toBe("3.1.0");
    expect(Object.keys(spec.json().paths).length).toBeGreaterThan(50);
  });
});

describe("webhooks", () => {
  it("entrega firmada con HMAC-SHA256 verificable y reenvío", async () => {
    const received: { headers: http.IncomingHttpHeaders; body: string }[] = [];
    let failNext = true;
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ headers: req.headers, body });
        if (failNext) {
          failNext = false;
          res.writeHead(500).end("boom");
        } else res.writeHead(200).end("ok");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as { port: number }).port;

    const res = await app.inject({ method: "POST", url: "/api/v1/webhooks", headers: { cookie }, payload: { url: `http://127.0.0.1:${port}/hook`, events: ["inventory.updated"] } });
    expect(res.statusCode).toBe(201);
    const secret = res.json().secret as string;
    expect(secret.startsWith("whsec_")).toBe(true);

    const loc = await defaultLocation();
    const p = await createProduct(cookie, { stock: 5 });
    await app.inject({ method: "POST", url: "/api/v1/inventory-adjustments", headers: { cookie }, payload: { variantId: p.variants[0]!.id, locationId: loc.id, mode: "delta", quantity: 1, reason: "Ajuste de prueba" } });
    for (let i = 0; i < 40 && received.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 100));
      await app.webhooks.processDue();
    }
    expect(received.length).toBeGreaterThanOrEqual(1);
    const first = received[received.length - 1]!;
    const ts = first.headers["x-webhook-timestamp"] as string;
    const sig = (first.headers["x-webhook-signature"] as string).replace("sha256=", "");
    expect(signWebhook(secret, ts, first.body)).toBe(sig);
    expect(signWebhook("otro", ts, first.body)).not.toBe(sig);
    expect(JSON.parse(first.body).event).toBe("inventory.updated");
    expect(JSON.parse(first.body).data.variant_id).toBe(p.variants[0]!.id);

    // El primer intento falló (500) → RETRYING con backoff; reenvío manual → SUCCESS
    const deliveries = await app.inject({ method: "GET", url: "/api/v1/webhook-deliveries", headers: { cookie } });
    const d = deliveries.json().data.find((x: { event: string }) => x.event === "inventory.updated");
    expect(d.status).toBe("RETRYING");
    expect(d.attempts).toBe(1);
    expect(d.nextAttemptAt).not.toBeNull();
    const resend = await app.inject({ method: "POST", url: `/api/v1/webhook-deliveries/${d.id}/resend`, headers: { cookie } });
    expect(resend.json().status).toBe("SUCCESS");
    expect(resend.json().responseStatus).toBe(200);
    server.close();
  });

  it("inventory.low_stock se emite al cruzar el umbral", async () => {
    const loc = await defaultLocation();
    await app.inject({ method: "POST", url: "/api/v1/webhooks", headers: { cookie }, payload: { url: "http://127.0.0.1:9/never", events: ["inventory.low_stock"] } });
    const p = await createProduct(cookie, { stock: 10 });
    await app.inject({ method: "PUT", url: "/api/v1/inventory-levels/min-stock", headers: { cookie }, payload: { variantId: p.variants[0]!.id, locationId: loc.id, minStock: 4 } });
    await app.inject({ method: "POST", url: "/api/v1/inventory-adjustments", headers: { cookie }, payload: { variantId: p.variants[0]!.id, locationId: loc.id, mode: "set", quantity: 3, reason: "Ajuste de prueba" } });
    let d = null;
    for (let i = 0; i < 30 && !d; i++) {
      await new Promise((r) => setTimeout(r, 100));
      d = await db.webhookDelivery.findFirst({ where: { event: "inventory.low_stock" }, orderBy: { createdAt: "desc" } });
    }
    expect(d).not.toBeNull();
    expect((d!.payload as { data: { available: number; threshold: number } }).data).toMatchObject({ available: 3, threshold: 4 });
  });
});
