import { describe, it, expect, beforeAll } from "vitest";
import { app, createProduct, defaultLocation, level, loginCookie, db } from "./setup";

let cookie: string;
beforeAll(async () => {
  cookie = await loginCookie();
});

describe("ventas", () => {
  it("una venta descuenta stock, calcula IVA incluido y registra cambio en efectivo", async () => {
    const loc = await defaultLocation();
    const p = await createProduct(cookie, { stock: 10, price: 11900, taxRate: 19 });
    const v = p.variants[0]!;
    const res = await app.inject({ method: "POST", url: "/api/v1/orders", headers: { cookie }, payload: { locationId: loc.id, items: [{ variantId: v.id, quantity: 2 }], payments: [{ methodCode: "cash", amount: 23800, received: 30000 }] } });
    expect(res.statusCode).toBe(201);
    const o = res.json();
    expect(o.total).toBe(23800);
    expect(o.taxTotal).toBe(3800);
    expect(o.paymentStatus).toBe("PAID");
    expect(o.status).toBe("COMPLETED");
    expect(o.payments[0].change).toBe(6200);
    expect((await level(v.id, loc.id)).available).toBe(8);
    const mov = await db.inventoryMovement.findFirst({ where: { referenceId: o.id } });
    expect(mov).toMatchObject({ type: "SALE", bucket: "AVAILABLE", quantity: -2, referenceType: "ORDER" });
  });

  it("pagos combinados y pago parcial", async () => {
    const loc = await defaultLocation();
    const p = await createProduct(cookie, { stock: 10, price: 50000 });
    let res = await app.inject({ method: "POST", url: "/api/v1/orders", headers: { cookie }, payload: { locationId: loc.id, items: [{ variantId: p.variants[0]!.id, quantity: 1 }], payments: [{ methodCode: "cash", amount: 20000 }, { methodCode: "nequi", amount: 10000, reference: "N-1" }] } });
    expect(res.json().paymentStatus).toBe("PARTIAL");
    expect(res.json().paidTotal).toBe(30000);
    res = await app.inject({ method: "POST", url: `/api/v1/orders/${res.json().id}/payments`, headers: { cookie }, payload: { payments: [{ methodCode: "card", amount: 20000 }] } });
    expect(res.json().paymentStatus).toBe("PAID");
  });

  it("descuento global se reparte y el total cuadra", async () => {
    const loc = await defaultLocation();
    const p = await createProduct(cookie, { stock: 10, price: 10000, variants: 2 });
    const res = await app.inject({ method: "POST", url: "/api/v1/orders", headers: { cookie }, payload: { locationId: loc.id, items: [{ variantId: p.variants[0]!.id, quantity: 1 }, { variantId: p.variants[1]!.id, quantity: 2 }], discount: 3000, payments: [{ methodCode: "cash", amount: 27000 }] } });
    const o = res.json();
    expect(o.subtotal).toBe(30000);
    expect(o.discountTotal).toBe(3000);
    expect(o.total).toBe(27000);
    expect(o.items.reduce((a: number, i: { total: number }) => a + i.total, 0)).toBe(27000);
  });

  it("devolución reingresa stock (disponible o no disponible) y reembolsa", async () => {
    const loc = await defaultLocation();
    const p = await createProduct(cookie, { stock: 10, price: 10000 });
    const v = p.variants[0]!;
    let res = await app.inject({ method: "POST", url: "/api/v1/orders", headers: { cookie }, payload: { locationId: loc.id, items: [{ variantId: v.id, quantity: 3 }], payments: [{ methodCode: "cash", amount: 30000 }] } });
    const o = res.json();
    expect((await level(v.id, loc.id)).available).toBe(7);
    res = await app.inject({ method: "POST", url: `/api/v1/orders/${o.id}/returns`, headers: { cookie }, payload: { items: [{ lineId: o.items[0].id, quantity: 1, restock: true, restockAs: "AVAILABLE" }, { lineId: o.items[0].id, quantity: 1, restock: true, restockAs: "UNAVAILABLE" }], reason: "Defectuoso" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().fulfillmentStatus).toBe("PARTIALLY_RETURNED");
    expect(res.json().refundedTotal).toBe(20000);
    expect(res.json().paymentStatus).toBe("PARTIALLY_REFUNDED");
    const l = await level(v.id, loc.id);
    expect(l).toMatchObject({ available: 8, unavailable: 1 });
    res = await app.inject({ method: "POST", url: `/api/v1/orders/${o.id}/returns`, headers: { cookie }, payload: { items: [{ lineId: o.items[0].id, quantity: 5, restock: true }], reason: "Ajuste de prueba" } });
    expect(res.statusCode).toBe(422);
  });

  it("anulación reingresa stock y reembolsa todo", async () => {
    const loc = await defaultLocation();
    const p = await createProduct(cookie, { stock: 5, price: 10000 });
    const v = p.variants[0]!;
    let res = await app.inject({ method: "POST", url: "/api/v1/orders", headers: { cookie }, payload: { locationId: loc.id, items: [{ variantId: v.id, quantity: 2 }], payments: [{ methodCode: "card", amount: 20000 }] } });
    res = await app.inject({ method: "POST", url: `/api/v1/orders/${res.json().id}/cancel`, headers: { cookie }, payload: { reason: "Error de digitación" } });
    expect(res.json().status).toBe("CANCELLED");
    expect(res.json().paymentStatus).toBe("REFUNDED");
    expect((await level(v.id, loc.id)).available).toBe(5);
  });

  it("orden en espera compromete stock y al entregar lo vende", async () => {
    const loc = await defaultLocation();
    const p = await createProduct(cookie, { stock: 5, price: 10000 });
    const v = p.variants[0]!;
    let res = await app.inject({ method: "POST", url: "/api/v1/orders", headers: { cookie }, payload: { locationId: loc.id, items: [{ variantId: v.id, quantity: 2 }], payments: [], hold: true } });
    expect(res.json().status).toBe("OPEN");
    expect(await level(v.id, loc.id)).toMatchObject({ available: 3, committed: 2 });
    res = await app.inject({ method: "POST", url: `/api/v1/orders/${res.json().id}/fulfill`, headers: { cookie } });
    expect(res.json().status).toBe("COMPLETED");
    expect(await level(v.id, loc.id)).toMatchObject({ available: 3, committed: 0 });
  });

  it("dos ventas simultáneas del último ítem: solo una gana", async () => {
    const loc = await defaultLocation();
    const p = await createProduct(cookie, { stock: 1, price: 10000 });
    const v = p.variants[0]!;
    const payload = { locationId: loc.id, items: [{ variantId: v.id, quantity: 1 }], payments: [{ methodCode: "cash", amount: 10000 }] };
    const results = await Promise.all(Array.from({ length: 6 }, () => app.inject({ method: "POST", url: "/api/v1/orders", headers: { cookie }, payload })));
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(5);
    expect((await level(v.id, loc.id)).available).toBe(0);
    const movs = await db.inventoryMovement.count({ where: { variantId: v.id, type: "SALE" } });
    expect(movs).toBe(1);
  });

  it("caja: apertura, venta en efectivo, cierre con arqueo", async () => {
    const loc = await defaultLocation();
    const p = await createProduct(cookie, { stock: 5, price: 10000 });
    let res = await app.inject({ method: "POST", url: "/api/v1/cash-sessions", headers: { cookie }, payload: { locationId: loc.id, openingAmount: 50000 } });
    expect(res.statusCode).toBe(201);
    const session = res.json();
    await app.inject({ method: "POST", url: "/api/v1/orders", headers: { cookie }, payload: { locationId: loc.id, cashSessionId: session.id, items: [{ variantId: p.variants[0]!.id, quantity: 1 }], payments: [{ methodCode: "cash", amount: 10000, received: 20000 }] } });
    await app.inject({ method: "POST", url: `/api/v1/cash-sessions/${session.id}/movements`, headers: { cookie }, payload: { type: "OUT", amount: 5000, reason: "Pago domicilio" } });
    res = await app.inject({ method: "POST", url: `/api/v1/cash-sessions/${session.id}/close`, headers: { cookie }, payload: { closingAmount: 54000 } });
    expect(res.json().expectedAmount).toBe(55000);
    expect(res.json().difference).toBe(-1000);
    expect(res.json().status).toBe("CLOSED");
  });
});
