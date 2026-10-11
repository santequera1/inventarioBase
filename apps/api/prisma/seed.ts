/**
 * Semilla base (idempotente): roles, configuración, ubicación predeterminada,
 * métodos de pago, motivos de ajuste y primer administrador.
 * Uso: pnpm db:seed  (variables ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME opcionales)
 */
import { PrismaClient } from "@prisma/client";
import { ROLE_PRESETS } from "@inventario/shared";
import { hashPassword } from "../src/lib/crypto";

const db = new PrismaClient();

export async function seedBase(prisma: PrismaClient, opts: { adminEmail?: string; adminPassword?: string; adminName?: string } = {}) {
  for (const [name, permissions] of Object.entries(ROLE_PRESETS)) {
    await prisma.role.upsert({ where: { name }, create: { name, permissions: [...permissions], isSystem: true }, update: name === "ADMIN" ? { permissions: [...permissions] } : {} });
  }
  await prisma.storeSettings.upsert({ where: { id: 1 }, create: { id: 1, name: "Inventario Willy", city: "Cartagena", currency: "COP", timezone: "America/Bogota" }, update: {} });
  const locCount = await prisma.location.count();
  if (locCount === 0) await prisma.location.create({ data: { name: "Tienda principal", city: "Cartagena", isDefault: true } });

  const methods = [
    { name: "Efectivo", code: "cash", type: "CASH", position: 1 },
    { name: "Tarjeta débito/crédito", code: "card", type: "CARD", position: 2, requiresReference: false },
    { name: "Transferencia bancaria", code: "transfer", type: "TRANSFER", position: 3, requiresReference: false },
    { name: "Nequi", code: "nequi", type: "WALLET", position: 4 },
    { name: "Daviplata", code: "daviplata", type: "WALLET", position: 5 },
  ];
  for (const m of methods) await prisma.paymentMethod.upsert({ where: { code: m.code }, create: m, update: {} });

  const reasons: { name: string; kind: string }[] = [
    { name: "Conteo físico", kind: "ADJUSTMENT" },
    { name: "Corrección de error", kind: "ADJUSTMENT" },
    { name: "Recepción sin orden de compra", kind: "ADJUSTMENT" },
    { name: "Stock inicial", kind: "ADJUSTMENT" },
    { name: "Robo o pérdida", kind: "ADJUSTMENT" },
    { name: "Promoción / obsequio", kind: "ADJUSTMENT" },
    { name: "Consumo interno", kind: "ADJUSTMENT" },
    { name: "Dañado", kind: "UNAVAILABLE" },
    { name: "En revisión / control de calidad", kind: "UNAVAILABLE" },
    { name: "Vencido", kind: "UNAVAILABLE" },
    { name: "Reservado para exhibición", kind: "UNAVAILABLE" },
    { name: "Cliente insatisfecho", kind: "RETURN" },
    { name: "Producto defectuoso", kind: "RETURN" },
    { name: "Talla o modelo equivocado", kind: "RETURN" },
  ];
  for (const [i, r] of reasons.entries()) await prisma.reason.upsert({ where: { name_kind: { name: r.name, kind: r.kind } }, create: { ...r, position: i }, update: {} });

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "ADMIN" } });
  const email = (opts.adminEmail ?? process.env.ADMIN_EMAIL ?? "admin@inventariowilly.local").toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  let password: string | null = null;
  if (!existing) {
    password = opts.adminPassword ?? process.env.ADMIN_PASSWORD ?? Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 8).toUpperCase() + "!";
    const loc = await prisma.location.findFirst({ where: { isDefault: true } });
    await prisma.user.create({ data: { email, name: opts.adminName ?? process.env.ADMIN_NAME ?? "Administrador", passwordHash: await hashPassword(password), roleId: adminRole.id, defaultLocationId: loc?.id ?? null } });
  }
  return { email, password };
}

const isMain = process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js");
if (isMain) {
  seedBase(db)
    .then((r) => {
      console.log("Semilla base aplicada.");
      if (r.password) console.log(`Administrador creado → ${r.email} / ${r.password}`);
      else console.log(`Administrador existente: ${r.email}`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
