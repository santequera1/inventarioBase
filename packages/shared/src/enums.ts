import { z } from "zod";

export const ProductStatus = z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]);
export type ProductStatus = z.infer<typeof ProductStatus>;

export const StockBucket = z.enum(["AVAILABLE", "COMMITTED", "UNAVAILABLE", "INCOMING"]);
export type StockBucket = z.infer<typeof StockBucket>;

export const MovementType = z.enum([
  "SALE",
  "ADJUSTMENT",
  "RECEIPT",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "RETURN",
  "COUNT",
  "STATE_CHANGE",
  "RESERVATION",
  "CANCELLATION",
  "PURCHASE_INCOMING",
]);
export type MovementType = z.infer<typeof MovementType>;

export const AdjustmentMode = z.enum(["delta", "set"]);
export type AdjustmentMode = z.infer<typeof AdjustmentMode>;

export const TransferStatus = z.enum(["DRAFT", "PENDING", "IN_TRANSIT", "RECEIVED", "CANCELLED"]);
export const CountStatus = z.enum(["OPEN", "APPLIED", "CANCELLED"]);
export const PurchaseOrderStatus = z.enum(["DRAFT", "ORDERED", "PARTIAL", "RECEIVED", "CANCELLED"]);

export const OrderStatus = z.enum(["OPEN", "COMPLETED", "CANCELLED"]);
export const PaymentStatus = z.enum(["PENDING", "PARTIAL", "PAID", "REFUNDED", "PARTIALLY_REFUNDED"]);
export const FulfillmentStatus = z.enum(["UNFULFILLED", "FULFILLED", "PARTIALLY_RETURNED", "RETURNED"]);
export const OrderSource = z.enum(["POS", "API", "MANUAL"]);

export const PaymentMethodType = z.enum(["CASH", "CARD", "TRANSFER", "WALLET", "OTHER"]);
export const CashSessionStatus = z.enum(["OPEN", "CLOSED"]);
export const DocumentType = z.enum(["CC", "NIT", "CE", "PASAPORTE", "OTRO"]);

export const WebhookEvent = z.enum([
  "inventory.updated",
  "inventory.low_stock",
  "product.created",
  "product.updated",
  "product.deleted",
  "order.created",
  "order.paid",
  "order.cancelled",
  "order.returned",
  "transfer.received",
  "purchase_order.received",
]);
export type WebhookEvent = z.infer<typeof WebhookEvent>;

export const DeliveryStatus = z.enum(["PENDING", "SUCCESS", "FAILED", "RETRYING"]);

export const API_SCOPES = [
  "read:products",
  "write:products",
  "read:inventory",
  "write:inventory",
  "read:orders",
  "write:orders",
  "read:customers",
  "write:customers",
  "read:suppliers",
  "write:suppliers",
  "read:reports",
  "read:locations",
  "write:webhooks",
] as const;
export const ApiScope = z.enum(API_SCOPES);
export type ApiScope = z.infer<typeof ApiScope>;

export const PERMISSIONS = [
  "products.read",
  "products.write",
  "inventory.read",
  "inventory.adjust",
  "inventory.transfer",
  "inventory.count",
  "purchases.read",
  "purchases.write",
  "orders.read",
  "orders.write",
  "orders.refund",
  "pos.use",
  "cash.manage",
  "customers.read",
  "customers.write",
  "suppliers.read",
  "suppliers.write",
  "reports.read",
  "settings.manage",
  "users.manage",
  "apikeys.manage",
  "webhooks.manage",
  "audit.read",
  "import.run",
] as const;
export const Permission = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof Permission>;

export const ROLE_PRESETS: Record<string, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  INVENTARIO: [
    "products.read",
    "products.write",
    "inventory.read",
    "inventory.adjust",
    "inventory.transfer",
    "inventory.count",
    "purchases.read",
    "purchases.write",
    "suppliers.read",
    "suppliers.write",
    "reports.read",
    "orders.read",
    "customers.read",
  ],
  VENDEDOR: [
    "products.read",
    "inventory.read",
    "orders.read",
    "orders.write",
    "pos.use",
    "cash.manage",
    "customers.read",
    "customers.write",
  ],
};
