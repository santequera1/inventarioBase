import type { Db, Tx } from "./prisma";
import { actorFields, type Actor } from "./actor";

export async function audit(
  db: Db | Tx,
  actor: Actor,
  action: string,
  entity: string,
  entityId: string | null,
  opts: { before?: unknown; after?: unknown; ip?: string | null } = {},
) {
  await db.auditLog.create({
    data: {
      action,
      entity,
      entityId,
      ...actorFields(actor),
      ip: opts.ip ?? null,
      before: opts.before === undefined ? undefined : (opts.before as object),
      after: opts.after === undefined ? undefined : (opts.after as object),
    },
  });
}
