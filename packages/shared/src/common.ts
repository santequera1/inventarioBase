import { z } from "zod";

export const id = z.string().cuid2().or(z.string().min(1));
export const isoDate = z.string().datetime({ offset: true });

/** Money in COP: integers, no decimals. */
export const money = z.coerce.number().int().min(0);
export const signedMoney = z.coerce.number().int();
export const quantity = z.coerce.number().int();
export const positiveQuantity = z.coerce.number().int().positive();

export const taxRate = z.union([z.literal(0), z.literal(5), z.literal(19)]);
export type TaxRate = z.infer<typeof taxRate>;

export const paginationQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.string().optional().describe("campo[:asc|desc], ej. updated_at:desc"),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export const pageMeta = z.object({
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
  limit: z.number().int(),
  total: z.number().int().optional(),
});

export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({ data: z.array(item), meta: pageMeta });
}

export const problem = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  errors: z
    .array(z.object({ path: z.string(), message: z.string(), code: z.string().optional() }))
    .optional(),
});
export type Problem = z.infer<typeof problem>;

export const okResponse = z.object({ ok: z.literal(true) });
export const idParam = z.object({ id: z.string().min(1) });

export const csvString = z.string().transform((s) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
);
