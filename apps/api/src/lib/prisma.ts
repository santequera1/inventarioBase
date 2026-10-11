import { PrismaClient, Prisma } from "@prisma/client";

export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;

export function createPrisma(url: string, logQueries = false): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url } },
    log: logQueries ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

/** Ejecuta `fn` dentro de una transacción interactiva con timeout razonable. */
export function withTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(fn, { timeout: 20_000, maxWait: 10_000 });
}

export { Prisma };
