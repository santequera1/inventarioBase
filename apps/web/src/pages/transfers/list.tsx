import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight } from "lucide-react";
import { Page, PageHeader } from "@/components/app/page";
import { DataTable, useCursorPagination } from "@/components/app/data-table";
import { IndexTableHeader, type ViewTab } from "@/components/app/index-table";
import { DateText, Qty } from "@/components/app/format";
import { TransferStatusBadge } from "@/components/app/badges";
import { EmptyState, ErrorState, NoResults } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useDebounce, useUrlState } from "@/lib/hooks";
import { usePage, type Transfer } from "@/lib/queries";

const DEFAULTS = { view: "all", q: "" };

export default function TransfersListPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [url, setUrl] = useUrlState(DEFAULTS);
  const dq = useDebounce(url.q);
  const status = url.view !== "all" && !url.view.startsWith("saved:") ? url.view : undefined;
  const pag = useCursorPagination(JSON.stringify([url.view, dq]));
  const transfers = usePage<Transfer>("transfers", "/transfers", { status, q: dq || undefined, limit: 50, cursor: pag.cursor });
  const tabs: ViewTab[] = [
    { id: "all", label: "Todas", filters: { view: "all" } },
    { id: "PENDING", label: "Pendientes", filters: { view: "PENDING" } },
    { id: "IN_TRANSIT", label: "En tránsito", filters: { view: "IN_TRANSIT" } },
    { id: "RECEIVED", label: "Recibidas", filters: { view: "RECEIVED" } },
  ];
  const columns = React.useMemo<ColumnDef<Transfer, unknown>[]>(
    () => [
      { id: "number", header: "Transferencia", cell: ({ row }) => <span className="font-medium tabular">{row.original.number}</span>, meta: { className: "w-[130px]" } },
      { id: "route", header: "Origen → Destino", cell: ({ row }) => <span className="flex items-center gap-1.5"><span className="truncate">{row.original.origin.name}</span><ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{row.original.destination.name}</span></span> },
      { id: "status", header: "Estado", cell: ({ row }) => <TransferStatusBadge status={row.original.status} />, meta: { className: "w-[130px]" } },
      { id: "created", header: "Creada", cell: ({ row }) => <DateText value={row.original.createdAt} className="text-muted-foreground" />, meta: { className: "hidden md:table-cell" } },
      { id: "expected", header: "Llegada estimada", cell: ({ row }) => <DateText value={row.original.expectedAt} className="text-muted-foreground" />, meta: { className: "hidden lg:table-cell" } },
      { id: "items", header: "Unidades", cell: ({ row }) => <Qty value={row.original.totalQuantity} />, meta: { numeric: true } },
    ],
    [],
  );
  return (
    <Page width="wide">
      <PageHeader title="Transferencias" subtitle="Mueve inventario entre ubicaciones. Lo despachado aparece como Entrante en el destino hasta recibirse." primaryAction={can("inventory.transfer") ? <Button asChild variant="primary"><Link to="/transferencias/nueva">Crear transferencia</Link></Button> : undefined} />
      <div className="surface overflow-hidden">
        <IndexTableHeader resource="transfers" tabs={tabs} activeTab={url.view} onTabChange={(t) => setUrl({ view: t.id.startsWith("saved:") ? t.id : t.filters.view ?? "all" })} search={url.q} onSearchChange={(q) => setUrl({ q })} searchPlaceholder="Buscar por número o nota" />
        {transfers.isError ? (
          <ErrorState error={transfers.error} onRetry={() => transfers.refetch()} />
        ) : (
          <DataTable columns={columns} data={transfers.data?.data ?? []} loading={transfers.isLoading || transfers.isFetching} getRowId={(r) => r.id} onRowClick={(r) => navigate(`/transferencias/${r.id}`)} pagination={{ hasMore: transfers.data?.meta.has_more ?? false, onNext: () => pag.next(transfers.data?.meta.next_cursor ?? null), onPrev: pag.prev, canPrev: pag.canPrev, total: transfers.data?.meta.total, shown: transfers.data?.data.length ?? 0 }} empty={dq || status ? <NoResults onClear={() => setUrl({ q: "", view: "all" })} /> : <EmptyState title="Sin transferencias" description="Crea una transferencia para mover stock entre tus ubicaciones." action={can("inventory.transfer") ? <Button asChild variant="primary"><Link to="/transferencias/nueva">Crear transferencia</Link></Button> : undefined} />} />
        )}
      </div>
    </Page>
  );
}
