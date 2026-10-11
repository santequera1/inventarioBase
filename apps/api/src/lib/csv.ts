import { stringify } from "csv-stringify/sync";
import { parse } from "csv-parse/sync";

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  // BOM para que Excel abra UTF-8 correctamente.
  return "﻿" + stringify([header, ...rows], { delimiter: ";" });
}

export function parseCsv(input: string): Record<string, string>[] {
  const clean = input.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  return parse(clean, { columns: (h: string[]) => h.map((c) => c.trim().toLowerCase()), delimiter, skip_empty_lines: true, trim: true, relax_column_count: true, bom: true }) as Record<string, string>[];
}
