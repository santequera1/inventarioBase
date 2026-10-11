import { z } from "zod";

export const importKind = z.enum(["products", "inventory", "customers"]);

export const importPreviewRow = z.object({
  row: z.number().int(),
  data: z.record(z.string()),
  errors: z.array(z.string()),
  action: z.enum(["create", "update", "skip", "error"]),
});
export const importPreviewResponse = z.object({
  kind: importKind,
  total: z.number().int(),
  valid: z.number().int(),
  invalid: z.number().int(),
  columns: z.array(z.string()),
  rows: z.array(importPreviewRow),
  token: z.string().describe("Token para confirmar la importación"),
});
export const importCommitBody = z.object({ token: z.string(), locationId: z.string().optional() });
export const importResultResponse = z.object({
  created: z.number().int(),
  updated: z.number().int(),
  skipped: z.number().int(),
  errors: z.array(z.object({ row: z.number().int(), message: z.string() })),
});
