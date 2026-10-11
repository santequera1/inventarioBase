import { describe, it, expect, beforeAll } from "vitest";
import { app, createProduct, defaultLocation, level, loginCookie, db } from "./setup";

let cookie: string;
beforeAll(async () => {
  cookie = await loginCookie();
});

describe("ajustes de inventario", () => {
  it("delta suma/resta y set fija la cantidad final", async () => {
    const loc = await defaultLocation();
    const p = await createProduct(cookie, { stock: 10 });
    const v = p.variants[0]!;

    let res = await app.inject({ method: "POST", url: "/api/v1/inventory-adjustments", headers: { cookie }, payload: { variantId: v.id, locationId: loc.id, mode: "delta", quantity: 10, reason: "Recepción" } });
    expect(res.statusCode).toBe(201);
    expect(res.json().level.available).toBe(20);

    res = await app.inject({ method: "POST", url: "/api/v1/inventory-adjustments", headers: { cookie }, payload: { variantId: v.id, locationId: loc.id, mode: "set", quantity: 10, reason: "Conteo" } });
    expect(res.statusCode).toBe(201);
    expect(res.json().level.available).toBe(10);
    expect(res.json().movements[0].quantity).toBe(-10);

    res = await app.inject({ method: "POST", url: "/api/v1/inventory-adjustments", headers: { cookie }, payload: { variantId: v.id, locationId: loc.id, mode: "delta", quantity: -3, reason: "Dañado" } });
    expect(res.json().level.available).toBe(7);
  });

  it("exige motivo", async () => {
    const loc = await defaultLocation();
    const p = await createProduct(cookie, { stock: 5 });
    const res = await app.inject({ method: "POST", url: "/api/v1/inventory-adjustments", headers: { cookie }, payload: { variantId: p.variants[0]!.id, locationId: loc.id, mode: "delta", quantity: 1 } });
    expect(res.statusCode).toBe(422);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.json().errors[0].path).toContain("reason");
  });

  it("la vista previa muestra antes → después sin guardar", async () => {
    const loc = await defaultLocation();
    const p = await createProduct(cookie, { stock: 24 });
    const res = await app.inject({ method: "POST", url: "/api/v1/inventory-adjustments/preview", headers: { cookie }, payload: { variantId: p.variants[0]!.id, locationId: loc.id, mode: "delta", quantity: -5, reason: "Ajuste de prueba" } });
    expect(res.json()).toMatchObject({ before: 24, after: 19, delta: -5 });
    expect((await level(p.variants[0]!.id, loc.id)).available).toBe(24);
  });

  it("no permite stock negativo por defecto, y sí cuando la política lo habilita", async () => {
    const loc = await defaultLocation();
    const p = await createProduct(cookie, { stock: 2 });
    let res = await app.inject({ method: "POST", url: "/api/v1/inventory-adjustments", headers: { cookie }, payload: { variantId: p.variants[0]!.id, locationId: loc.id, mode: "delta", quantity: -5, reason: "Ajuste de prueba" } });
    expect(res.statusCode).toBe(409);
    expect(res.json().type).toContain("insufficient-stock");

    await app.inject({ method: "PATCH", url: "/api/v1/settings", headers: { cookie }, payload: { allowNegativeStock: true } });
    res = await app.inject({ method: "POST", url: "/api/v1/inventory-adjustments", headers: { cookie }, payload: { variantId: p.variants[0]!.id, locationId: loc.id, mode: "delta", quantity: -5, reason: "Ajuste de prueba" } });
    expect(res.statusCode).toBe(201);
    expect(res.json().level.available).toBe(-3);
    await app.inject({ method: "PATCH", url: "/api/v1/settings", headers: { cookie }, payload: { allowNegativeStock: false } });
  });

  it("cambio de estado mueve entre disponible y no disponible; en existencia no cambia", async () => {
    const loc = await defaultLocation();
    const p = await createProduct(cookie, { stock: 10 });
    const res = await app.inject({ method: "POST", url: "/api/v1/inventory-adjustments/state-change", headers: { cookie }, payload: { variantId: p.variants[0]!.id, locationId: loc.id, from: "AVAILABLE", to: "UNAVAILABLE", quantity: 3, reason: "Dañado" } });
    expect(res.statusCode).toBe(201);
    const l = res.json().level;
    expect(l.available).toBe(7);
    expect(l.unavailable).toBe(3);
    expect(l.onHand).toBe(10);
    expect(l.onHand).toBe(l.available + l.committed + l.unavailable);
  });

  it("el libro mayor cuadra con el nivel (En existencia = Disp + Comp + No disp)", async () => {
    const loc = await defaultLocation();
    const p = await createProduct(cookie, { stock: 50 });
    const v = p.variants[0]!;
    await app.inject({ method: "POST", url: "/api/v1/inventory-adjustments", headers: { cookie }, payload: { variantId: v.id, locationId: loc.id, mode: "delta", quantity: -7, reason: "Ajuste de prueba" } });
    await app.inject({ method: "POST", url: "/api/v1/inventory-adjustments/state-change", headers: { cookie }, payload: { variantId: v.id, locationId: loc.id, from: "AVAILABLE", to: "UNAVAILABLE", quantity: 4, reason: "Ajuste de prueba" } });
    await app.inject({ method: "POST", url: "/api/v1/orders", headers: { cookie }, payload: { locationId: loc.id, items: [{ variantId: v.id, quantity: 2 }], payments: [{ methodCode: "cash", amount: 20000 }], hold: true } });
    const l = await level(v.id, loc.id);
    const sums = await db.inventoryMovement.groupBy({ by: ["bucket"], where: { variantId: v.id, locationId: loc.id }, _sum: { quantity: true } });
    const ledger = Object.fromEntries(sums.map((s) => [s.bucket, s._sum.quantity ?? 0]));
    expect(l.available).toBe(ledger.AVAILABLE ?? 0);
    expect(l.committed).toBe(ledger.COMMITTED ?? 0);
    expect(l.unavailable).toBe(ledger.UNAVAILABLE ?? 0);
    expect(l.available + l.committed + l.unavailable).toBe(50 - 7);
    const last = await db.inventoryMovement.findFirst({ where: { variantId: v.id }, orderBy: { createdAt: "desc" } });
    expect(last!.availableAfter + last!.committedAfter + last!.unavailableAfter).toBe(43);
  });

  it("listado de inventario filtra por estado de existencias", async () => {
    const loc = await defaultLocation();
    const p = await createProduct(cookie, { stock: 0 });
    const res = await app.inject({ method: "GET", url: `/api/v1/inventory-levels?stock_state=out_of_stock&sku=${p.variants[0]!.sku}`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].onHand).toBe(0);
    void loc;
  });
});

describe("transferencias y compras", () => {
  it("transferencia: origen baja, destino entrante y luego disponible", async () => {
    const loc = await defaultLocation();
    const dest = await db.location.create({ data: { name: `Bodega ${Date.now()}` } });
    const p = await createProduct(cookie, { stock: 20 });
    const v = p.variants[0]!;
    let res = await app.inject({ method: "POST", url: "/api/v1/transfers", headers: { cookie }, payload: { originLocationId: loc.id, destinationLocationId: dest.id, items: [{ variantId: v.id, quantity: 8 }], dispatch: true } });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("IN_TRANSIT");
    expect((await level(v.id, loc.id)).available).toBe(12);
    expect((await level(v.id, dest.id)).incoming).toBe(8);
    res = await app.inject({ method: "POST", url: `/api/v1/transfers/${res.json().id}/receive`, headers: { cookie }, payload: { items: [{ variantId: v.id, quantity: 5 }] } });
    expect(res.json().status).toBe("IN_TRANSIT");
    expect((await level(v.id, dest.id))).toMatchObject({ available: 5, incoming: 3 });
    res = await app.inject({ method: "POST", url: `/api/v1/transfers/${res.json().id}/receive`, headers: { cookie }, payload: {} });
    expect(res.json().status).toBe("RECEIVED");
    expect((await level(v.id, dest.id))).toMatchObject({ available: 8, incoming: 0 });
  });

  it("orden de compra: entrante → disponible y costo promedio", async () => {
    const loc = await defaultLocation();
    const sup = await db.supplier.create({ data: { name: "Prov" } });
    const p = await createProduct(cookie, { stock: 10, cost: 1000 });
    const v = p.variants[0]!;
    let res = await app.inject({ method: "POST", url: "/api/v1/purchase-orders", headers: { cookie }, payload: { supplierId: sup.id, locationId: loc.id, items: [{ variantId: v.id, quantity: 10, unitCost: 2000 }], place: true } });
    expect(res.statusCode).toBe(201);
    expect((await level(v.id, loc.id)).incoming).toBe(10);
    res = await app.inject({ method: "POST", url: `/api/v1/purchase-orders/${res.json().id}/receive`, headers: { cookie }, payload: {} });
    expect(res.json().status).toBe("RECEIVED");
    expect((await level(v.id, loc.id))).toMatchObject({ available: 20, incoming: 0 });
    const variant = await db.variant.findUnique({ where: { id: v.id } });
    expect(variant!.cost).toBe(1500);
  });

  it("conteo físico aplica diferencias con modo set", async () => {
    const loc = await defaultLocation();
    const p = await createProduct(cookie, { stock: 15 });
    const v = p.variants[0]!;
    let res = await app.inject({ method: "POST", url: "/api/v1/stock-counts", headers: { cookie }, payload: { locationId: loc.id, items: [{ variantId: v.id, counted: 12 }] } });
    expect(res.statusCode).toBe(201);
    expect(res.json().items[0].difference).toBe(-3);
    res = await app.inject({ method: "POST", url: `/api/v1/stock-counts/${res.json().id}/apply`, headers: { cookie }, payload: {} });
    expect(res.json().status).toBe("APPLIED");
    expect((await level(v.id, loc.id)).available).toBe(12);
    const m = await db.inventoryMovement.findFirst({ where: { variantId: v.id, type: "COUNT" } });
    expect(m!.quantity).toBe(-3);
  });
});
