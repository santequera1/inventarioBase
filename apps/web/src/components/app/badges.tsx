import { Badge } from "@/components/ui/badge";
import {
  countStatusLabels, deliveryStatusLabels, fulfillmentStatusLabels, orderStatusLabels, paymentStatusLabels, productStatusLabels, purchaseStatusLabels, transferStatusLabels,
} from "@inventario/shared";

type Tone = "neutral" | "success" | "warning" | "critical" | "info" | "outline";

export function StockBadge({ available, minStock, threshold }: { available: number; minStock: number | null; threshold: number }) {
  if (available <= 0) return <Badge tone="neutral">Agotado</Badge>;
  if (available <= (minStock ?? threshold)) return <Badge tone="warning">Stock bajo</Badge>;
  return null;
}

const productTone: Record<string, Tone> = { ACTIVE: "success", DRAFT: "info", ARCHIVED: "neutral" };
export const ProductStatusBadge = ({ status }: { status: string }) => <Badge tone={productTone[status] ?? "neutral"}>{productStatusLabels[status] ?? status}</Badge>;

const orderTone: Record<string, Tone> = { OPEN: "info", COMPLETED: "success", CANCELLED: "neutral" };
export const OrderStatusBadge = ({ status }: { status: string }) => <Badge tone={orderTone[status] ?? "neutral"}>{orderStatusLabels[status] ?? status}</Badge>;

const paymentTone: Record<string, Tone> = { PENDING: "warning", PARTIAL: "warning", PAID: "success", REFUNDED: "neutral", PARTIALLY_REFUNDED: "info" };
export const PaymentStatusBadge = ({ status }: { status: string }) => <Badge tone={paymentTone[status] ?? "neutral"}>{paymentStatusLabels[status] ?? status}</Badge>;

const fulfillmentTone: Record<string, Tone> = { UNFULFILLED: "warning", FULFILLED: "success", PARTIALLY_RETURNED: "info", RETURNED: "neutral" };
export const FulfillmentBadge = ({ status }: { status: string }) => <Badge tone={fulfillmentTone[status] ?? "neutral"}>{fulfillmentStatusLabels[status] ?? status}</Badge>;

const transferTone: Record<string, Tone> = { DRAFT: "neutral", PENDING: "info", IN_TRANSIT: "warning", RECEIVED: "success", CANCELLED: "neutral" };
export const TransferStatusBadge = ({ status }: { status: string }) => <Badge tone={transferTone[status] ?? "neutral"}>{transferStatusLabels[status] ?? status}</Badge>;

const purchaseTone: Record<string, Tone> = { DRAFT: "neutral", ORDERED: "info", PARTIAL: "warning", RECEIVED: "success", CANCELLED: "neutral" };
export const PurchaseStatusBadge = ({ status }: { status: string }) => <Badge tone={purchaseTone[status] ?? "neutral"}>{purchaseStatusLabels[status] ?? status}</Badge>;

const countTone: Record<string, Tone> = { OPEN: "info", APPLIED: "success", CANCELLED: "neutral" };
export const CountStatusBadge = ({ status }: { status: string }) => <Badge tone={countTone[status] ?? "neutral"}>{countStatusLabels[status] ?? status}</Badge>;

const deliveryTone: Record<string, Tone> = { PENDING: "info", SUCCESS: "success", FAILED: "critical", RETRYING: "warning" };
export const DeliveryStatusBadge = ({ status }: { status: string }) => <Badge tone={deliveryTone[status] ?? "neutral"}>{deliveryStatusLabels[status] ?? status}</Badge>;

export const ActiveBadge = ({ active }: { active: boolean }) => <Badge tone={active ? "success" : "neutral"}>{active ? "Activo" : "Inactivo"}</Badge>;
