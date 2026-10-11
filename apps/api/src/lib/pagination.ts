import { E } from "./errors";

export type SortSpec = { field: string; dir: "asc" | "desc" };

export function parseSort(sort: string | undefined, allowed: Record<string, string>, fallback: SortSpec): SortSpec {
  if (!sort) return fallback;
  const [rawField, rawDir] = sort.split(":");
  const field = allowed[rawField ?? ""];
  if (!field) {
    throw E.badRequest(`Campo de ordenamiento no permitido: "${rawField}". Permitidos: ${Object.keys(allowed).join(", ")}.`);
  }
  const dir = rawDir === "asc" ? "asc" : rawDir === "desc" || rawDir === undefined ? "desc" : null;
  if (!dir) throw E.badRequest(`Dirección de ordenamiento inválida: "${rawDir}". Usa asc o desc.`);
  return { field, dir };
}

export function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}
export function decodeCursor(cursor: string | undefined): string | undefined {
  if (!cursor) return undefined;
  try {
    const id = Buffer.from(cursor, "base64url").toString("utf8");
    if (!id) throw new Error("empty");
    return id;
  } catch {
    throw E.badRequest("El cursor de paginación no es válido.");
  }
}

/**
 * Helper para paginación por cursor con Prisma: pide limit+1 filas y arma meta.
 */
export function buildPage<T extends { id: string }>(rows: T[], limit: number, total?: number) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  return {
    data,
    meta: {
      next_cursor: hasMore && last ? encodeCursor(last.id) : null,
      has_more: hasMore,
      limit,
      ...(total !== undefined ? { total } : {}),
    },
  };
}

export function cursorArgs(cursor: string | undefined, limit: number) {
  const id = decodeCursor(cursor);
  return {
    take: limit + 1,
    ...(id ? { cursor: { id }, skip: 1 } : {}),
  };
}

export function parseExpand(expand: string | undefined): Set<string> {
  return new Set(
    (expand ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}
