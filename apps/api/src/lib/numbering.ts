import type { Tx } from "./prisma";

/** Siguiente número secuencial para un contador (transfer, count, po...). Seguro ante concurrencia. */
export async function nextNumber(tx: Tx, key: string, prefix: string, pad = 4): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  const value = rows[0]?.value ?? 1;
  return `${prefix}${String(value).padStart(pad, "0")}`;
}

/** Número de orden usando prefijo y contador de la configuración de tienda. */
export async function nextOrderNumber(tx: Tx): Promise<{ number: string; sequence: number }> {
  const rows = await tx.$queryRaw<{ orderNextNumber: number; orderPrefix: string }[]>`
    UPDATE "StoreSettings" SET "orderNextNumber" = "orderNextNumber" + 1 WHERE id = 1
    RETURNING "orderNextNumber", "orderPrefix"`;
  const row = rows[0];
  if (!row) throw new Error("StoreSettings no inicializado");
  const sequence = row.orderNextNumber - 1;
  return { number: `${row.orderPrefix}${sequence}`, sequence };
}
