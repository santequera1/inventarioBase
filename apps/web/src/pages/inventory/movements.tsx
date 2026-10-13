import * as React from "react";
import type { SortingState } from "@tanstack/react-table";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { MovementType, movementTypeLabels, bucketLabels, StockBucket } from "@inventario/shared";
import { Page, PageHeader } from "@/components/app/page";
import { DataTable, useCursorPagination } from "@/components/app/data-table";
import { IndexTableHeader, FilterGroup, type ViewTab } from "@/components/app/index-table";
import { DateRange, LocationSelect, SimpleSelect } from "@/components/app/pickers";
import { EmptyState, ErrorState, NoResults } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { api, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounce, useSelectedLocation, useUrlState } from "@/lib/hooks";
import { usePage, type Movement } from "@/lib/queries";
import { downloadBlob } from "@/lib/utils";
import { movementColumns, MovementMobileRow } from "./movements-table";

const DEFAULTS = { view: "all", q: "", type: "", bucket: "", from: "", to: "", sort: "created_at:desc" };
const VIEW_TYPES: Record<string, string> = { sales: "SALE,RETURN,CANCELLATION", adjustments: "ADJUSTMENT,COUNT,STATE_CHANGE", receipts: "RECEIPT,PURCHASE_INCOMING", transfers: "TRANSFER_IN,TRANSFER_OUT" };

export default function MovementsPage() {
  const { user } = useAuth();
  const [locationId, setLocationId] = useSelectedLocation(user?.defaultLocationId);
  const [url, setUrl] = useUrlState(DEFAULTS);
  const dq = useDebounce(url.q, 300);
  const typeFilter = url.type || VIEW_TYPES[url.view] || undefined;
  const resetKey = JSON.stringify([locationId, url.view, dq, url.type, url.bucket, url.from, url.to, url.sort]);
  const pag = useCursorPagination(resetKey);
  const params = { location_id: locationId || undefined, q: dq || undefined, type: typeFilter, bucket: url.bucket || undefined, from: url.from || undefined, to: url.to || undefined, sort: url.sort, limit: 50, cursor: pag.cursor };
  const movements = usePage<Movement>("movements", "/inventory-movements", params);

  const tabs: ViewTab[] = [
    { id: "all", label: "Todos", filters: { view: "all" } },
    { id: "sales", label: "Ventas y devoluciones", filters: { view: "sales" } },
    { id: "adjustments", label: "Ajustes y conteos", filters: { view: "adjustments" } },
    { id: "receipts", label: "Recepciones", filters: { view: "receipts" } },
    { id: "transfers", label: "Transferencias", filters: { view: "transfers" } },
  ];
  const sorting: SortingState = React.useMemo(() => {
    const [id, dir] = url.sort.split(":");
    return [{ id: id!, desc: dir === "desc" }];
  }, [url.sort]);
  const columns = React.useMemo(() => movementColumns({ showProduct: true, showLocation: !locationId }), [locationId]);

  const exportCsv = async () => {
    try {
      const blob = await api.blob(v1("/inventory-movements/export"), { ...params, cursor: undefined, limit: undefined });
      downloadBlob(blob, `movimientos-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success("Exportación lista");
    } catch {
      toast.error("No se pudo exportar");
    }
  };

  const chips = [
    ...(url.type ? [{ label: `Tipo: ${movementTypeLabels[url.type] ?? url.type}`, onRemove: () => setUrl({ type: "" }) }] : []),
    ...(url.bucket ? [{ label: `Estado: ${bucketLabels[url.bucket]}`, onRemove: () => setUrl({ bucket: "" }) }] : []),
    ...(url.from || url.to ? [{ label: `Fecha: ${url.from || "…"} – ${url.to || "…"}`, onRemove: () => setUrl({ from: "", to: "" }) }] : []),
  ];
  const hasFilters = chips.length > 0 || !!dq || url.view !== "all";

  return (
    <Page width="wide">
      <PageHeader title="Movimientos de inventario" subtitle={<span className="hidden sm:inline">Libro mayor inmutable: cada cambio de stock, con su motivo, usuario y documento origen.</span>} secondaryActions={<LocationSelect value={locationId} onChange={setLocationId} allowAll />} primaryAction={<Button variant="secondary" onClick={exportCsv}><Download /> Exportar CSV</Button>} />
      <div className="surface overflow-hidden">
        <IndexTableHeader
          resource="movements"
          tabs={tabs}
          activeTab={url.view}
          onTabChange={(t) => setUrl({ view: t.id.startsWith("saved:") ? t.id : t.filters.view ?? "all", q: t.filters.q ?? "", type: t.filters.type ?? "", bucket: t.filters.bucket ?? "", from: t.filters.from ?? "", to: t.filters.to ?? "" })}
          search={url.q}
          onSearchChange={(q) => setUrl({ q })}
          searchPlaceholder="Buscar por producto, SKU, motivo, referencia o usuario"
          currentFilters={{ view: url.view, q: url.q, type: url.type, bucket: url.bucket, from: url.from, to: url.to }}
          activeFilterChips={chips}
          onClearFilters={() => setUrl({ type: "", bucket: "", from: "", to: "" })}
          filters={
            <>
              <FilterGroup label="Tipo de movimiento">
                <SimpleSelect value={url.type} onChange={(v) => setUrl({ type: v })} options={MovementType.options.map((t) => ({ value: t, label: movementTypeLabels[t] ?? t }))} placeholder="Todos los tipos" />
              </FilterGroup>
              <FilterGroup label="Estado afectado">
                <SimpleSelect value={url.bucket} onChange={(v) => setUrl({ bucket: v })} options={StockBucket.options.map((b) => ({ value: b, label: bucketLabels[b] ?? b }))} placeholder="Todos los estados" />
              </FilterGroup>
              <FilterGroup label="Rango de fechas">
                <DateRange from={url.from} to={url.to} onChange={(r) => setUrl(r)} />
              </FilterGroup>
            </>
          }
        />
        {movements.isError ? (
          <ErrorState error={movements.error} onRetry={() => movements.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            data={movements.data?.data ?? []}
            loading={movements.isLoading || movements.isFetching}
            getRowId={(r) => r.id}
            mobileRow={(m) => <MovementMobileRow m={m} showLocation={!locationId} />}
            sorting={sorting}
            onSortingChange={(u) => {
              const next = typeof u === "function" ? u(sorting) : u;
              const s = next[0];
              if (s) setUrl({ sort: `${s.id}:${s.desc ? "desc" : "asc"}` });
            }}
            pagination={{ hasMore: movements.data?.meta.has_more ?? false, onNext: () => pag.next(movements.data?.meta.next_cursor ?? null), onPrev: pag.prev, canPrev: pag.canPrev, total: movements.data?.meta.total, shown: movements.data?.data.length ?? 0 }}
            empty={hasFilters ? <NoResults onClear={() => setUrl({ q: "", type: "", bucket: "", from: "", to: "", view: "all" })} /> : <EmptyState title="Sin movimientos" description="Los movimientos aparecen aquí cuando vendes, ajustas, recibes o transfieres inventario." />}
          />
        )}
      </div>
    </Page>
  );
}
