import type { Permission } from "@inventario/shared";

export type Serialized<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

/** Convierte Date → ISO string recursivamente para cumplir los esquemas de respuesta. */
export function iso<T>(value: T): Serialized<T> {
  if (value instanceof Date) return value.toISOString() as Serialized<T>;
  if (Array.isArray(value)) return value.map((v) => iso(v)) as Serialized<T>;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = iso(v);
    return out as Serialized<T>;
  }
  return value as Serialized<T>;
}

export function serializeUser(u: {
  id: string; email: string; name: string; active: boolean; roleId: string; defaultLocationId: string | null; lastLoginAt: Date | null; createdAt: Date;
  role: { id: string; name: string; permissions: string[]; isSystem: boolean };
}) {
  return {
    id: u.id, email: u.email, name: u.name, active: u.active, roleId: u.roleId, defaultLocationId: u.defaultLocationId,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString(),
    role: { id: u.role.id, name: u.role.name, permissions: u.role.permissions as Permission[], isSystem: u.role.isSystem },
  };
}

export function thumbUrl(path: string | null | undefined): string | null {
  return path ? `/uploads/${path}` : null;
}
