import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { PaymentStatus, FulfillmentStatus, paymentStatusLabels, fulfillmentStatusLabels } from "@inventario/shared";
import { Page, PageHeader } from "@/components/app/page";
import { DataTable, useCursorPagination } from "@/components/app/data-table";
import { IndexTableHeader, FilterGroup, type ViewTab } from "@/components/app/index-table";
import { DateRange, LocationSelect, SimpleSelect } from "@/components/app/pickers";
import { DateText, Money, Qty } from "@/components/app/format";
import { FulfillmentBadge, OrderStatusBadge, PaymentStatusBadge } from "@/components/app/badges";
import { EmptyState, ErrorState, NoResults } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { api, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounce, useSelectedLocation, useUrlState } from "@/lib/hooks";
import { usePage, type Order } from "@/lib/queries";
import { downloadBlob } from "@/lib/utils";

const DEFAULTS = { view: "all", q: "", payment: "", fulfillment: "", from: "", to: "", sort: "created_at:desc" };

export default function OrdersListPage() {
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const [locationId, setLocationId] = useSelectedLocation(user?.defaultLocationId);
  const [url, setUrl] = useUrlState(DEFAULTS);
  const dq = useDebounce(url.q);
  const status = ["OPEN", "COMPLETED", "CANCELLED"].includes(url.view) ? url.view : undefined;
  const pag = useCursorPagination(JSON.stringify([locationId, url]));
  const params = { location_id: locationId || undefined, status, q: dq || undefined, payment_status: url.payment || undefined, fulfillment_status: url.fulfillment || undefined, from: url.from || undefined, to: url.to || undefined, sort: url.sort, limit: 50, cursor: pag.cursor };
  const orders = usePage<Order>("orders", "/orders", params);
  const tabs: ViewTab[] = [{ id: "all", label: "Todas", filters: { view: "all" } }, { id: "OPEN", label: "Abiertas", filters: { view: "OPEN" } }, { id: "COMPLETED", label: "Completadas", filters: { view: "COMPLETED" } }, { id: "CANCELLED", label: "Anuladas", filters: { view: "CANCELLED" } }];
  const sorting: SortingState = React.useMemo(() => { const [id, dir] = url.sort.split(":"); return [{ id: id!, desc: dir === "desc" }]; }, [url.sort]);
  const columns = React.useMemo<ColumnDef<Order, unknown>[]>(() => [
    { id: "number", header: "Orden", enableSorting: true, cell: ({ row }) => <span className="font-medium tabular">{row.original.number}</span>, meta: { className: "w-[100px]" } },
    { id: "created_at", header: "Fecha", enableSorting: true, cell: ({ row }) => <DateText value={row.original.createdAt} time className="text-muted-foreground" />, meta: { className: "whitespace-nowrap" } },
    { id: "customer", header: "Cliente", cell: ({ row }) => row.original.customer ? <span>{row.original.customer.firstName} {row.original.customer.lastName}</span> : <span className="text-muted-foreground">Sin cliente</span>, meta: { className: "hidden md:table-cell" } },
    { id: "status", header: "Estado", cell: ({ row }) => <OrderStatusBadge status={row.original.status} />, meta: { className: "hidden sm:table-cell w-[110px]" } },
    { id: "payment", header: "Pago", cell: ({ row }) => <PaymentStatusBadge status={row.original.paymentStatus} />, meta: { className: "w-[140px]" } },
    { id: "fulfillment", header: "Entrega", cell: ({ row }) => <FulfillmentBadge status={row.original.fulfillmentStatus} />, meta: { className: "hidden lg:table-cell w-[140px]" } },
    { id: "items", header: "Art.", cell: ({ row }) => <Qty value={row.original.itemCount} />, meta: { numeric: true, className: "hidden md:table-cell w-[70px]" } },
    { id: "total", header: "Total", enableSorting: true, cell: ({ row }) => <Money value={row.original.total} className="font-medium" />, meta: { numeric: true } },
  ], []);
  const chips = [
    ...(url.payment ? [{ label: `Pago: ${paymentStatusLabels[url.payment]}`, onRemove: () => setUrl({ payment: "" }) }] : []),
    ...(url.fulfillment ? [{ label: `Entrega: ${fulfillmentStatusLabels[url.fulfillment]}`, onRemove: () => setUrl({ fulfillment: "" }) }] : []),
    ...(url.from || url.to ? [{ label: `Fecha: ${url.from || "…"} – ${url.to || "…"}`, onRemove: () => setUrl({ from: "", to: "" }) }] : []),
  ];
  return (
    <Page width="wide">
      <PageHeader title="Órdenes" primaryAction={can("pos.use") ? <Button asChild variant="primary"><Link to="/pos">Nueva venta</Link></Button> : undefined} secondaryActions={<><LocationSelect value={locationId} onChange={setLocationId} allowAll /><Button variant="secondary" onClick={async () => { try { downloadBlob(await api.blob(v1("/orders/export"), { ...params, cursor: undefined, limit: undefined }), "ordenes.csv"); } catch { toast.error("No se pudo exportar"); } }}><Download /> Exportar</Button></>} />
      <div className="surface overflow-hidden">
        <IndexTableHeader resource="orders" tabs={tabs} activeTab={url.view} onTabChange={(t) => setUrl({ view: t.id.startsWith("saved:") ? t.id : t.filters.view ?? "all", q: t.filters.q ?? "", payment: t.filters.payment ?? "", fulfillment: t.filters.fulfillment ?? "", from: t.filters.from ?? "", to: t.filters.to ?? "" })} search={url.q} onSearchChange={(q) => setUrl({ q })} searchPlaceholder="Buscar por número, cliente, documento o SKU" currentFilters={{ view: url.view, q: url.q, payment: url.payment, fulfillment: url.fulfillment, from: url.from, to: url.to }} activeFilterChips={chips} onClearFilters={() => setUrl({ payment: "", fulfillment: "", from: "", to: "" })}
          filters={<><FilterGroup label="Estado de pago"><SimpleSelect value={url.payment} onChange={(v) => setUrl({ payment: v })} options={PaymentStatus.options.map((s) => ({ value: s, label: paymentStatusLabels[s]! }))} placeholder="Todos" /></FilterGroup><FilterGroup label="Estado de entrega"><SimpleSelect value={url.fulfillment} onChange={(v) => setUrl({ fulfillment: v })} options={FulfillmentStatus.options.map((s) => ({ value: s, label: fulfillmentStatusLabels[s]! }))} placeholder="Todos" /></FilterGroup><FilterGroup label="Fechas"><DateRange from={url.from} to={url.to} onChange={(r) => setUrl(r)} /></FilterGroup></>} />
        {orders.isError ? <ErrorState error={orders.error} onRetry={() => orders.refetch()} /> : <DataTable columns={columns} data={orders.data?.data ?? []} loading={orders.isLoading || orders.isFetching} getRowId={(r) => r.id} onRowClick={(r) => navigate(`/ordenes/${r.id}`)} sorting={sorting} onSortingChange={(u) => { const n = typeof u === "function" ? u(sorting) : u; const s = n[0]; if (s) setUrl({ sort: `${s.id}:${s.desc ? "desc" : "asc"}` }); }} pagination={{ hasMore: orders.data?.meta.has_more ?? false, onNext: () => pag.next(orders.data?.meta.next_cursor ?? null), onPrev: pag.prev, canPrev: pag.canPrev, total: orders.data?.meta.total, shown: orders.data?.data.length ?? 0 }} empty={dq || chips.length || status ? <NoResults onClear={() => setUrl({ ...DEFAULTS })} /> : <EmptyState title="Aún no hay órdenes" description="Las ventas del POS y las creadas por la API aparecen aquí con su estado de pago y entrega." action={can("pos.use") ? <Button asChild variant="primary"><Link to="/pos">Nueva venta</Link></Button> : undefined} />} />}
      </div>
    </Page>
  );
}
