import * as React from "react";
import { Link } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { bucketLabels, movementTypeLabels } from "@inventario/shared";
import { DataTable } from "@/components/app/data-table";
import { ProductCell } from "@/components/app/product-cell";
import { DateText, Qty } from "@/components/app/format";
import { Badge } from "@/components/ui/badge";
import type { Movement } from "@/lib/queries";
import { cn } from "@/lib/utils";

const refLink = (m: Movement): string | null => {
  if (!m.referenceId) return null;
  switch (m.referenceType) {
    case "ORDER": return `/ordenes/${m.referenceId}`;
    case "TRANSFER": return `/transferencias/${m.referenceId}`;
    case "PURCHASE_ORDER": return `/compras/${m.referenceId}`;
    case "COUNT": return `/inventario/conteos/${m.referenceId}`;
    case "PRODUCT": return `/productos/${m.referenceId}`;
    default: return null;
  }
};

const typeTone: Record<string, "neutral" | "success" | "warning" | "critical" | "info" | "outline"> = {
  SALE: "info", RETURN: "success", RECEIPT: "success", ADJUSTMENT: "neutral", COUNT: "neutral", STATE_CHANGE: "warning", TRANSFER_IN: "info", TRANSFER_OUT: "info", RESERVATION: "info", CANCELLATION: "neutral", PURCHASE_INCOMING: "outline",
};

export function MovementTypeBadge({ type }: { type: string }) {
  return <Badge tone={typeTone[type] ?? "neutral"}>{movementTypeLabels[type] ?? type}</Badge>;
}

export function movementColumns(opts: { showProduct?: boolean; showLocation?: boolean }): ColumnDef<Movement, unknown>[] {
  return [
    { id: "created_at", header: "Fecha", enableSorting: true, cell: ({ row }) => <DateText value={row.original.createdAt} time className="text-muted-foreground" />, meta: { className: "w-[170px] whitespace-nowrap" } },
    ...(opts.showProduct
      ? [{ id: "product", header: "Producto", cell: ({ row }) => { const m = row.original; return m.variant ? <ProductCell title={m.variant.product.title} variantTitle={m.variant.title} sku={m.variant.sku} thumbUrl={m.variant.product.thumbUrl} to={`/inventario/${m.variantId}/${m.locationId}`} compact /> : <span className="text-muted-foreground">—</span>; } } as ColumnDef<Movement, unknown>]
      : []),
    ...(opts.showLocation ? [{ id: "location", header: "Ubicación", cell: ({ row }) => <span className="text-muted-foreground">{row.original.location?.name}</span>, meta: { className: "hidden lg:table-cell" } } as ColumnDef<Movement, unknown>] : []),
    { id: "type", header: "Tipo", cell: ({ row }) => <MovementTypeBadge type={row.original.type} />, meta: { className: "hidden sm:table-cell w-[150px]" } },
    { id: "bucket", header: "Estado afectado", cell: ({ row }) => <span className={cn(row.original.bucket !== "AVAILABLE" && "text-muted-foreground")}>{bucketLabels[row.original.bucket]}</span>, meta: { className: "hidden md:table-cell w-[130px]" } },
    {
      id: "reason",
      header: "Motivo / Referencia",
      cell: ({ row }) => {
        const m = row.original;
        const link = refLink(m);
        return (
          <div className="min-w-0">
            <div className="truncate">{m.reason ?? <span className="text-muted-foreground">—</span>}</div>
            <div className="truncate text-sm text-muted-foreground">
              {m.referenceLabel ? (link ? <Link to={link} className="hover:underline underline-offset-2" onClick={(e) => e.stopPropagation()}>{m.referenceLabel}</Link> : m.referenceLabel) : null}
              {m.referenceLabel && m.note ? " · " : null}
              {m.note}
            </div>
          </div>
        );
      },
      meta: { className: "hidden md:table-cell max-w-[280px]" },
    },
    { id: "actor", header: "Usuario", cell: ({ row }) => <span className="truncate text-muted-foreground">{row.original.actorName ?? (row.original.actorType === "API_KEY" ? "API" : "Sistema")}{row.original.actorType === "API_KEY" ? <Badge tone="outline" className="ml-1.5">API</Badge> : null}</span>, meta: { className: "hidden xl:table-cell w-[160px]" } },
    { id: "quantity", header: "Cantidad", enableSorting: true, cell: ({ row }) => <Qty value={row.original.quantity} signed className="font-medium" />, meta: { numeric: true, className: "w-[90px]" } },
    { id: "available_after", header: "Disponible", cell: ({ row }) => <Qty value={row.original.availableAfter} className="text-muted-foreground" />, meta: { numeric: true, className: "hidden lg:table-cell w-[100px]" } },
    { id: "on_hand_after", header: "En existencia", cell: ({ row }) => <Qty value={row.original.availableAfter + row.original.committedAfter + row.original.unavailableAfter} className="text-muted-foreground" />, meta: { numeric: true, className: "hidden lg:table-cell w-[110px]" } },
  ];
}

export { DataTable as MovementsDataTable };
