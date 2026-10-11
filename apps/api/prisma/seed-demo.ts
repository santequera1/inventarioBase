/**
 * Datos de demostración (tienda colombiana). NUNCA se ejecuta por defecto.
 * Uso: pnpm db:seed:demo  — requiere DEMO_SEED=1 para confirmar.
 */
import { PrismaClient } from "@prisma/client";
import { seedBase } from "./seed";
import { createProduct } from "../src/services/products";
import { createOrder } from "../src/services/orders";
import { SYSTEM_ACTOR } from "../src/lib/actor";

const db = new PrismaClient();

if (process.env.DEMO_SEED !== "1") {
  console.error("Por seguridad, la semilla de demostración requiere DEMO_SEED=1.");
  process.exit(1);
}

async function main() {
  await seedBase(db);
  if ((await db.product.count()) > 0) {
    console.log("Ya hay productos; no se cargan datos demo.");
    return;
  }
  const settings = await db.storeSettings.findUniqueOrThrow({ where: { id: 1 } });
  const main = await db.location.findFirstOrThrow({ where: { isDefault: true } });
  const bodega = await db.location.create({ data: { name: "Bodega Bosque", city: "Cartagena", address: "Av. Pedro de Heredia #45-30" } });

  const cats = Object.fromEntries(
    await Promise.all(
      ["Ropa", "Calzado", "Accesorios", "Hogar", "Tecnología"].map(async (name) => [name, await db.category.create({ data: { name, slug: name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") } })] as const),
    ),
  );
  const suppliers = Object.fromEntries(
    await Promise.all(
      [
        { name: "Textiles del Caribe S.A.S.", nit: "900123456-7", city: "Barranquilla", phone: "3015551234", email: "ventas@textilescaribe.co" },
        { name: "Distribuidora Andina", nit: "800987654-1", city: "Medellín", phone: "3045556789", email: "pedidos@dandina.co" },
        { name: "Importaciones Cartagena", nit: "901555333-2", city: "Cartagena", phone: "3005557890", email: "info@importcartagena.co" },
      ].map(async (s) => [s.name, await db.supplier.create({ data: { name: s.name, nit: s.nit, phone: s.phone, email: s.email, address: s.city } })] as const),
    ),
  );

  const products: Parameters<typeof createProduct>[1][] = [
    {
      title: "Camiseta básica algodón", description: "Camiseta unisex 100% algodón peinado, cuello redondo.", status: "ACTIVE", categoryId: cats["Ropa"]!.id, supplierId: suppliers["Textiles del Caribe S.A.S."]!.id, tags: ["basicos", "verano"], taxRate: 19,
      options: [{ name: "Talla", values: ["S", "M", "L", "XL"] }, { name: "Color", values: ["Blanco", "Negro"] }],
      variants: [
        ...["S", "M", "L", "XL"].flatMap((t) => ["Blanco", "Negro"].map((c) => ({ sku: `CAM-${t}-${c.slice(0, 3).toUpperCase()}`, barcode: `77010${t.charCodeAt(0)}${c.length}${Math.floor(Math.random() * 9000 + 1000)}`, price: 45000, compareAtPrice: 55000, cost: 21000, weightGrams: 180, optionValues: { Talla: t, Color: c }, trackInventory: true, active: true, initialStock: [{ locationId: main.id, available: t === "XL" ? 3 : 18 }, { locationId: bodega.id, available: 40 }] }))),
      ],
    },
    {
      title: "Jean slim fit hombre", description: "Jean azul oscuro corte slim, 98% algodón 2% elastano.", status: "ACTIVE", categoryId: cats["Ropa"]!.id, supplierId: suppliers["Textiles del Caribe S.A.S."]!.id, tags: ["jeans"], taxRate: 19,
      options: [{ name: "Talla", values: ["30", "32", "34", "36"] }],
      variants: ["30", "32", "34", "36"].map((t, i) => ({ sku: `JEAN-SLIM-${t}`, barcode: `7702000${t}11`, price: 129000, compareAtPrice: null, cost: 62000, weightGrams: 600, optionValues: { Talla: t }, trackInventory: true, active: true, initialStock: [{ locationId: main.id, available: [12, 20, 9, 2][i]! }] })),
    },
    {
      title: "Tenis urbanos Costa", description: "Tenis casuales con suela de goma antideslizante.", status: "ACTIVE", categoryId: cats["Calzado"]!.id, supplierId: suppliers["Distribuidora Andina"]!.id, tags: ["calzado"], taxRate: 19,
      options: [{ name: "Talla", values: ["38", "39", "40", "41", "42"] }],
      variants: ["38", "39", "40", "41", "42"].map((t, i) => ({ sku: `TEN-COSTA-${t}`, barcode: `7703000${t}22`, price: 189000, compareAtPrice: 219000, cost: 95000, weightGrams: 900, optionValues: { Talla: t }, trackInventory: true, active: true, initialStock: [{ locationId: main.id, available: [4, 7, 10, 6, 0][i]! }, { locationId: bodega.id, available: 12 }] })),
    },
    {
      title: "Gorra trucker Cartagena", description: "Gorra con malla trasera y bordado frontal.", status: "ACTIVE", categoryId: cats["Accesorios"]!.id, supplierId: suppliers["Importaciones Cartagena"]!.id, tags: ["souvenir"], taxRate: 19,
      options: [{ name: "Color", values: ["Azul", "Beige", "Negro"] }],
      variants: ["Azul", "Beige", "Negro"].map((c, i) => ({ sku: `GOR-TRK-${c.slice(0, 3).toUpperCase()}`, barcode: `770400000${i}3`, price: 38000, compareAtPrice: null, cost: 14000, weightGrams: 90, optionValues: { Color: c }, trackInventory: true, active: true, initialStock: [{ locationId: main.id, available: 25 }] })),
    },
    {
      title: "Bolso tote lona", description: "Bolso de lona gruesa con asas reforzadas.", status: "ACTIVE", categoryId: cats["Accesorios"]!.id, supplierId: suppliers["Importaciones Cartagena"]!.id, tags: ["eco"], taxRate: 19, options: [],
      variants: [{ sku: "BOL-TOTE-01", barcode: "7705000000014", price: 52000, compareAtPrice: null, cost: 24000, weightGrams: 250, optionValues: {}, trackInventory: true, active: true, initialStock: [{ locationId: main.id, available: 14 }] }],
    },
    {
      title: "Termo acero 750 ml", description: "Termo doble pared, mantiene frío 24 h.", status: "ACTIVE", categoryId: cats["Hogar"]!.id, supplierId: suppliers["Distribuidora Andina"]!.id, tags: ["hogar"], taxRate: 19,
      options: [{ name: "Color", values: ["Plata", "Verde"] }],
      variants: ["Plata", "Verde"].map((c, i) => ({ sku: `TER-750-${c.slice(0, 3).toUpperCase()}`, barcode: `770600000${i}5`, price: 79000, compareAtPrice: 95000, cost: 38000, weightGrams: 400, optionValues: { Color: c }, trackInventory: true, active: true, initialStock: [{ locationId: main.id, available: i === 0 ? 8 : 1 }] })),
    },
    {
      title: "Café de origen Sierra Nevada 500 g", description: "Café tostado en grano, tueste medio.", status: "ACTIVE", categoryId: cats["Hogar"]!.id, supplierId: suppliers["Distribuidora Andina"]!.id, tags: ["alimentos"], taxRate: 5, options: [],
      variants: [{ sku: "CAF-SN-500", barcode: "7707000000016", price: 32000, compareAtPrice: null, cost: 18000, weightGrams: 520, optionValues: {}, trackInventory: true, active: true, initialStock: [{ locationId: main.id, available: 30 }, { locationId: bodega.id, available: 60 }] }],
    },
    {
      title: "Panela orgánica 1 kg", description: "Panela en bloque, sin aditivos.", status: "ACTIVE", categoryId: cats["Hogar"]!.id, supplierId: suppliers["Distribuidora Andina"]!.id, tags: ["alimentos"], taxRate: 0, options: [],
      variants: [{ sku: "PAN-ORG-1K", barcode: "7708000000017", price: 9500, compareAtPrice: null, cost: 5200, weightGrams: 1000, optionValues: {}, trackInventory: true, active: true, initialStock: [{ locationId: main.id, available: 45 }] }],
    },
    {
      title: "Audífonos inalámbricos Onda", description: "Bluetooth 5.3, estuche de carga, 24 h de autonomía.", status: "ACTIVE", categoryId: cats["Tecnología"]!.id, supplierId: suppliers["Importaciones Cartagena"]!.id, tags: ["tech"], taxRate: 19,
      options: [{ name: "Color", values: ["Negro", "Blanco"] }],
      variants: ["Negro", "Blanco"].map((c, i) => ({ sku: `AUD-ONDA-${c.slice(0, 3).toUpperCase()}`, barcode: `770900000${i}8`, price: 149000, compareAtPrice: 179000, cost: 72000, weightGrams: 120, optionValues: { Color: c }, trackInventory: true, active: true, initialStock: [{ locationId: main.id, available: [6, 0][i]! }, { locationId: bodega.id, available: 15 }] })),
    },
    {
      title: "Cargador USB-C 30 W", description: "Cargador rápido compacto.", status: "DRAFT", categoryId: cats["Tecnología"]!.id, supplierId: suppliers["Importaciones Cartagena"]!.id, tags: ["tech"], taxRate: 19, options: [],
      variants: [{ sku: "CAR-USBC-30", barcode: "7710000000019", price: 59000, compareAtPrice: null, cost: 27000, weightGrams: 80, optionValues: {}, trackInventory: true, active: true }],
    },
  ];
  for (const p of products) await db.$transaction((tx) => createProduct(tx, p, SYSTEM_ACTOR, false), { timeout: 30000 });

  const customers = await Promise.all(
    [
      { firstName: "Ana María", lastName: "Pérez Gómez", documentType: "CC", documentNumber: "1047123456", email: "ana.perez@example.com", phone: "3001234567", city: "Cartagena" },
      { firstName: "Carlos", lastName: "Rodríguez", documentType: "CC", documentNumber: "73120456", email: "carlos.r@example.com", phone: "3109876543", city: "Cartagena" },
      { firstName: "Comercializadora La Popa", lastName: null, companyName: "Comercializadora La Popa S.A.S.", documentType: "NIT", documentNumber: "901222333-4", email: "compras@lapopa.co", phone: "6056601234", city: "Cartagena" },
      { firstName: "Luisa", lastName: "Martínez", documentType: "CC", documentNumber: "1143001122", email: null, phone: "3155550000", city: "Turbaco" },
    ].map((c) => db.customer.create({ data: c })),
  );

  // Ventas de los últimos 14 días
  const variants = await db.variant.findMany({ where: { product: { status: "ACTIVE" }, levels: { some: { locationId: main.id, available: { gt: 2 } } } } });
  const methods = ["cash", "card", "nequi", "transfer", "daviplata"];
  for (let day = 13; day >= 0; day--) {
    const n = 2 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const picks = [...variants].sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3));
      const items = picks.map((v) => ({ variantId: v.id, quantity: 1 + Math.floor(Math.random() * 2), discount: 0 }));
      const customer = Math.random() < 0.5 ? customers[Math.floor(Math.random() * customers.length)]! : null;
      try {
        const { order } = await db.$transaction((tx) => createOrder(tx, { locationId: main.id, customerId: customer?.id ?? null, items, discount: Math.random() < 0.2 ? 5000 : 0, payments: [{ methodCode: methods[Math.floor(Math.random() * methods.length)]!, amount: 10_000_000, received: 10_000_000 }], source: "POS", hold: false }, SYSTEM_ACTOR, settings), { timeout: 30000 });
        const when = new Date(Date.now() - day * 86400_000 - Math.floor(Math.random() * 10 * 3600_000));
        await db.order.update({ where: { id: order.id }, data: { createdAt: when, completedAt: when, updatedAt: when } });
        await db.inventoryMovement.updateMany({ where: { referenceType: "ORDER", referenceId: order.id }, data: { createdAt: when } });
        await db.orderEvent.updateMany({ where: { orderId: order.id }, data: { createdAt: when } });
        await db.orderPayment.updateMany({ where: { orderId: order.id }, data: { createdAt: when } });
      } catch {
        /* stock agotado: ignorar */
      }
    }
  }
  console.log("Datos de demostración cargados.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
