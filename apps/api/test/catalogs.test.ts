import { describe, it, expect, beforeAll } from "vitest";
import { app, createApiKey, createProduct, db, loginCookie } from "./setup";

let cookie: string;
beforeAll(async () => {
  cookie = await loginCookie();
});

async function createCatalog(payload: Record<string, unknown>) {
  const res = await app.inject({ method: "POST", url: "/api/v1/catalogs", headers: { cookie }, payload: { name: "Catálogo Navidad", whatsappPhone: "314 754 3024", ...payload } });
  expect(res.statusCode).toBe(201);
  return res.json();
}

describe("catálogos compartibles", () => {
  it("crea catálogo con enlace no adivinable y normaliza el WhatsApp", async () => {
    const p = await createProduct(cookie, { stock: 5 });
    const c = await createCatalog({ productIds: [p.id] });
    expect(c.slug).toMatch(/^catalogo-navidad-[a-z2-9]{8}$/);
    expect(c.whatsappPhone).toBe("573147543024");
    expect(c.productIds).toEqual([p.id]);
  });

  it("el catálogo público no requiere sesión y solo muestra sus productos activos", async () => {
    const inCat = await createProduct(cookie, { stock: 3, price: 25000, variants: 2 });
    const outCat = await createProduct(cookie, { stock: 3 });
    const c = await createCatalog({ productIds: [inCat.id], showStock: true });
    const res = await app.inject({ method: "GET", url: `/api/public/catalogs/${c.slug}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.products.map((p: { id: string }) => p.id)).toEqual([inCat.id]);
    expect(body.products[0].variants[0]).toMatchObject({ price: 25000, inStock: true, available: 3 });
    expect(JSON.stringify(body)).not.toContain("cost");
    expect(body.products.find((p: { id: string }) => p.id === outCat.id)).toBeUndefined();
    expect((await db.catalog.findUniqueOrThrow({ where: { id: c.id } })).views).toBe(1);
  });

  it("checkout arma el mensaje discriminado, guarda el pedido y devuelve el enlace de WhatsApp", async () => {
    const p = await createProduct(cookie, { stock: 10, price: 35000, variants: 2 });
    const c = await createCatalog({ productIds: [p.id] });
    const res = await app.inject({
      method: "POST",
      url: `/api/public/catalogs/${c.slug}/checkout`,
      payload: { items: [{ variantId: p.variants[0]!.id, quantity: 2 }, { variantId: p.variants[1]!.id, quantity: 1 }, { variantId: p.variants[0]!.id, quantity: 1 }], customerName: "Ana", note: "Entregar en Bocagrande" },
    });
    expect(res.statusCode).toBe(200);
    const out = res.json();
    expect(out.total).toBe(35000 * 4);
    expect(out.code).toMatch(/^P-[A-Z2-9]{6}$/);
    expect(out.whatsappUrl.startsWith("https://wa.me/573147543024?text=")).toBe(true);
    expect(out.message).toContain("3 x $ 35.000 = $ 105.000");
    expect(out.message).toContain(`SKU: ${p.variants[0]!.sku}`);
    expect(out.message).toContain("(S)");
    expect(out.message).toContain("Nombre: Ana");
    expect(out.message).toContain(`Código de pedido: *${out.code}*`);
    const inquiry = await db.catalogInquiry.findUniqueOrThrow({ where: { code: out.code } });
    expect(inquiry).toMatchObject({ total: 140000, itemCount: 4, status: "NEW" });

    // El bot puede consultarlo con una API key
    const key = await createApiKey(cookie, ["read:orders"]);
    const byCode = await app.inject({ method: "GET", url: `/api/v1/catalog-inquiries/${out.code.toLowerCase()}`, headers: { authorization: `Bearer ${key}` } });
    expect(byCode.statusCode).toBe(200);
    expect(byCode.json().items).toHaveLength(2);
  });

  it("rechaza productos ajenos al catálogo, agotados o con cantidad mayor al stock", async () => {
    const p = await createProduct(cookie, { stock: 2 });
    const other = await createProduct(cookie, { stock: 2 });
    const empty = await createProduct(cookie, { stock: 0 });
    const c = await createCatalog({ productIds: [p.id, empty.id] });
    const url = `/api/public/catalogs/${c.slug}/checkout`;
    let res = await app.inject({ method: "POST", url, payload: { items: [{ variantId: other.variants[0]!.id, quantity: 1 }] } });
    expect(res.statusCode).toBe(409);
    res = await app.inject({ method: "POST", url, payload: { items: [{ variantId: empty.variants[0]!.id, quantity: 1 }] } });
    expect(res.statusCode).toBe(409);
    expect(res.json().type).toContain("insufficient-stock");
    res = await app.inject({ method: "POST", url, payload: { items: [{ variantId: p.variants[0]!.id, quantity: 3 }] } });
    expect(res.statusCode).toBe(409);
    expect(res.json().detail).toContain("Solo hay 2");
  });

  it("modo todos los productos, ocultar agotados, desactivar y regenerar enlace", async () => {
    const withStock = await createProduct(cookie, { stock: 1 });
    const noStock = await createProduct(cookie, { stock: 0 });
    const c = await createCatalog({ allProducts: true, hideOutOfStock: true });
    let res = await app.inject({ method: "GET", url: `/api/public/catalogs/${c.slug}` });
    const ids = res.json().products.map((p: { id: string }) => p.id);
    expect(ids).toContain(withStock.id);
    expect(ids).not.toContain(noStock.id);

    const regen = await app.inject({ method: "POST", url: `/api/v1/catalogs/${c.id}/regenerate-link`, headers: { cookie } });
    expect(regen.json().slug).not.toBe(c.slug);
    res = await app.inject({ method: "GET", url: `/api/public/catalogs/${c.slug}` });
    expect(res.statusCode).toBe(404);

    await app.inject({ method: "PATCH", url: `/api/v1/catalogs/${c.id}`, headers: { cookie }, payload: { active: false } });
    res = await app.inject({ method: "GET", url: `/api/public/catalogs/${regen.json().slug}` });
    expect(res.statusCode).toBe(404);
  });

  it("agregar productos en bloque no duplica", async () => {
    const a = await createProduct(cookie);
    const b = await createProduct(cookie);
    const c = await createCatalog({ productIds: [a.id] });
    const res = await app.inject({ method: "POST", url: `/api/v1/catalogs/${c.id}/products`, headers: { cookie }, payload: { productIds: [a.id, b.id] } });
    expect(res.statusCode).toBe(200);
    expect(res.json().productIds).toEqual([a.id, b.id]);
  });
});
