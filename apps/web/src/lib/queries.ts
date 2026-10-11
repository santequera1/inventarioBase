import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { z } from "zod";
import type {
  locationSchema, categorySchema, supplierSchema, reasonSchema, paymentMethodSchema, storeSettingsSchema, inventoryLevelSchema, movementSchema,
  productSchema, orderSchema, customerSchema, transferSchema, countSchema, purchaseOrderSchema, cashSessionSchema, savedViewSchema, apiKeySchema, webhookSchema, webhookDeliverySchema, userSchema, roleSchema, auditLogSchema, homeSummarySchema,
} from "@inventario/shared";
import { api, v1 } from "./api";

export type Location = z.infer<typeof locationSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Supplier = z.infer<typeof supplierSchema>;
export type Reason = z.infer<typeof reasonSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type StoreSettings = z.infer<typeof storeSettingsSchema>;
export type InventoryLevel = z.infer<typeof inventoryLevelSchema>;
export type Movement = z.infer<typeof movementSchema>;
export type Product = z.infer<typeof productSchema>;
export type Order = z.infer<typeof orderSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type Transfer = z.infer<typeof transferSchema>;
export type StockCount = z.infer<typeof countSchema>;
export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;
export type CashSession = z.infer<typeof cashSessionSchema>;
export type SavedView = z.infer<typeof savedViewSchema>;
export type ApiKey = z.infer<typeof apiKeySchema>;
export type Webhook = z.infer<typeof webhookSchema>;
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;
export type AppUser = z.infer<typeof userSchema>;
export type Role = z.infer<typeof roleSchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;
export type HomeSummary = z.infer<typeof homeSummarySchema>;

export type Page<T> = { data: T[]; meta: { next_cursor: string | null; has_more: boolean; limit: number; total?: number } };
type Params = Record<string, string | number | boolean | undefined | null>;

export function usePage<T>(key: string, path: string, params: Params, enabled = true) {
  return useQuery({ queryKey: [key, params], queryFn: () => api.get<Page<T>>(v1(path), params), placeholderData: keepPreviousData, enabled });
}
export function useOne<T>(key: string, path: string, id: string | undefined) {
  return useQuery({ queryKey: [key, id], queryFn: () => api.get<T>(v1(`${path}/${id}`)), enabled: !!id });
}

export const useLocations = () => useQuery({ queryKey: ["locations"], queryFn: () => api.get<{ data: Location[] }>(v1("/locations")), staleTime: 60_000, select: (d) => d.data });
export const useCategories = () => useQuery({ queryKey: ["categories"], queryFn: () => api.get<{ data: Category[] }>(v1("/categories")), staleTime: 60_000, select: (d) => d.data });
export const useReasons = (kind?: string) => useQuery({ queryKey: ["reasons", kind], queryFn: () => api.get<{ data: Reason[] }>(v1("/reasons"), { kind, active: "true" }), staleTime: 60_000, select: (d) => d.data });
export const usePaymentMethods = (activeOnly = true) => useQuery({ queryKey: ["payment-methods", activeOnly], queryFn: () => api.get<{ data: PaymentMethod[] }>(v1("/payment-methods"), activeOnly ? { active: "true" } : {}), staleTime: 60_000, select: (d) => d.data });
export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: () => api.get<StoreSettings>(v1("/settings")), staleTime: 60_000 });
export const useSavedViews = (resource: string) => useQuery({ queryKey: ["saved-views", resource], queryFn: () => api.get<{ data: SavedView[] }>(v1("/saved-views"), { resource }), select: (d) => d.data });
export const useSuppliersAll = () => useQuery({ queryKey: ["suppliers", "all"], queryFn: () => api.get<Page<Supplier>>(v1("/suppliers"), { limit: 200, active: "true" }), staleTime: 60_000, select: (d) => d.data });

/** Invalidador común tras mutaciones de inventario. */
export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

export function useApiMutation<TIn, TOut>(fn: (input: TIn) => Promise<TOut>, invalidate: string[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: [k] })));
    },
  });
}
