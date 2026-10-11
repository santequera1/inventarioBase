import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { Page, PageHeader } from "@/components/app/page";
import { DataTable, useCursorPagination } from "@/components/app/data-table";
import { IndexTableHeader, type ViewTab } from "@/components/app/index-table";
import { DateText, Money, Qty } from "@/components/app/format";
import { PurchaseStatusBadge } from "@/components/app/badges";
import { EmptyState, ErrorState, NoResults } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useDebounce, useUrlState } from "@/lib/hooks";
import { usePage, type PurchaseOrder } from "@/lib/queries";

export default function PurchasesListPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [url, setUrl] = useUrlState({ view: "all", q: "" });
  const dq = useDebounce(url.q);
  const status = url.view !== "all" && !url.view.startsWith("saved:") ? url.view : undefined;
  const pag = useCursorPagination(JSON.stringify([url.view, dq]));
  const pos = usePage<PurchaseOrder>("purchase-orders", "/purchase-orders", { status, q: dq || undefined, limit: 50, cursor: pag.cursor });
  const tabs: ViewTab[] = [{ id: "all", label: "Todas", filters: { view: "all" } }, { id: "DRAFT", label: "Borradores", filters: { view: "DRAFT" } }, { id: "ORDERED", label: "Pedidas", filters: { view: "ORDERED" } }, { id: "PARTIAL", label: "Parciales", filters: { view: "PARTIAL" } }, { id: "RECEIVED", label: "Recibidas", filters: { view: "RECEIVED" } }];
  const columns = React.useMemo<ColumnDef<PurchaseOrder, unknown>[]>(() => [
    { id: "number", header: "Orden", cell: ({ row }) => <span className="font-medium tabular">{row.original.number}</span>, meta: { className: "w-[120px]" } },
    { id: "supplier", header: "Proveedor", cell: ({ row }) => row.original.supplier.name },
    { id: "location", header: "Destino", cell: ({ row }) => <span className="text-muted-foreground">{row.original.location.name}</span>, meta: { className: "hidden md:table-cell" } },
    { id: "status", header: "Estado", cell: ({ row }) => <PurchaseStatusBadge status={row.original.status} />, meta: { className: "w-[150px]" } },
    { id: "expected", header: "Llegada", cell: ({ row }) => <DateText value={row.original.expectedAt} className="text-muted-foreground" />, meta: { className: "hidden lg:table-cell" } },
    { id: "received", header: "Recibido", cell: ({ row }) => <span className="tabular"><Qty value={row.original.items.reduce((a, i) => a + i.receivedQuantity, 0)} /> <span className="text-muted-foreground">/ {row.original.items.reduce((a, i) => a + i.quantity, 0)}</span></span>, meta: { numeric: true, className: "hidden sm:table-cell" } },
    { id: "total", header: "Total", cell: ({ row }) => <Money value={row.original.subtotal} />, meta: { numeric: true } },
  ], []);
  return (
    <Page width="wide">
      <PageHeader title="Órdenes de compra" subtitle="Lo pedido aparece como Entrante; al recibir pasa a Disponible y actualiza el costo promedio." primaryAction={can("purchases.write") ? <Button asChild variant="primary"><Link to="/compras/nueva">Crear orden de compra</Link></Button> : undefined} />
      <div className="surface overflow-hidden">
        <IndexTableHeader resource="purchase-orders" tabs={tabs} activeTab={url.view} onTabChange={(t) => setUrl({ view: t.id.startsWith("saved:") ? t.id : t.filters.view ?? "all" })} search={url.q} onSearchChange={(q) => setUrl({ q })} searchPlaceholder="Buscar por número, referencia o proveedor" />
        {pos.isError ? <ErrorState error={pos.error} onRetry={() => pos.refetch()} /> : <DataTable columns={columns} data={pos.data?.data ?? []} loading={pos.isLoading || pos.isFetching} getRowId={(r) => r.id} onRowClick={(r) => navigate(`/compras/${r.id}`)} pagination={{ hasMore: pos.data?.meta.has_more ?? false, onNext: () => pag.next(pos.data?.meta.next_cursor ?? null), onPrev: pag.prev, canPrev: pag.canPrev, total: pos.data?.meta.total, shown: pos.data?.data.length ?? 0 }} empty={dq || status ? <NoResults onClear={() => setUrl({ q: "", view: "all" })} /> : <EmptyState title="Sin órdenes de compra" description="Registra lo que pides a tus proveedores para ver el stock entrante y recibirlo cuando llegue." action={can("purchases.write") ? <Button asChild variant="primary"><Link to="/compras/nueva">Crear orden de compra</Link></Button> : undefined} />} />}
      </div>
    </Page>
  );
}
