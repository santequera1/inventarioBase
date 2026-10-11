import type { ApiScope, Permission } from "@inventario/shared";

export type Actor =
  | { type: "USER"; id: string; name: string; email: string; permissions: Permission[]; roleName: string; defaultLocationId: string | null }
  | { type: "API_KEY"; id: string; name: string; scopes: ApiScope[] }
  | { type: "SYSTEM"; id: null; name: "Sistema" };

export const SYSTEM_ACTOR: Actor = { type: "SYSTEM", id: null, name: "Sistema" };

export function actorFields(actor: Actor) {
  return { actorType: actor.type, actorId: actor.id, actorName: actor.name };
}

export function ownerKey(actor: Actor): string {
  return actor.type === "USER" ? `user:${actor.id}` : actor.type === "API_KEY" ? `apikey:${actor.id}` : "system";
}
