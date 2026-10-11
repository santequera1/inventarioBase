import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, SortingState, RowSelectionState } from "@tanstack/react-table";
import { ChevronDown, ClipboardList, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { Page, PageHeader } from "@/components/app/page";
import { DataTable, useCursorPagination } from "@/components/app/data-table";
import { IndexTableHeader, FilterGroup, type ViewTab } from "@/components/app/index-table";
import { LocationSelect, SimpleSelect } from "@/components/app/pickers";
import { ProductCell } from "@/components/app/product-cell";
import { Qty } from "@/components/app/format";
import { StockBadge } from "@/components/app/badges";
import { EmptyState, ErrorState, NoResults } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounce, useSelectedLocation, useUrlState } from "@/lib/hooks";
import { useCategories, usePage, useSettings, type InventoryLevel } from "@/lib/queries";
import { downloadBlob } from "@/lib/utils";
import { AdjustDialog, type AdjustTarget } from "./adjust-dialog";
import { BulkAdjustDialog } from "./bulk-adjust-dialog";

const DEFAULTS = { view: "all", q: "", category: "", sort: "product:asc", ajustar: "" };

export default function InventoryListPage() {
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const [locationId, setLocationId] = useSelectedLocation(user?.defaultLocationId);
  const [url, setUrl] = useUrlState(DEFAULTS);
  const dq = useDebounce(url.q, 300);
  const settings = useSettings();
  const categories = useCategories();
  const [adjustOpen, setAdjustOpen] = React.useState(url.ajustar === "1");
  const [adjustTarget, setAdjustTarget] = React.useState<AdjustTarget | null>(null);
  const [adjustKind, setAdjustKind] = React.useState<"adjust" | "state">("adjust");
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [selection, setSelection] = React.useState<RowSelectionState>({});

  const stockState = url.view === "low_stock" || url.view === "out_of_stock" || url.view === "in_stock" ? url.view : undefined;
  const resetKey = JSON.stringify([locationId, url.view, dq, url.category, url.sort]);
  const pag = useCursorPagination(resetKey);
  const params = { location_id: locationId || undefined, q: dq || undefined, category_id: url.category || undefined, stock_state: stockState, sort: url.sort, limit: 50, cursor: pag.cursor };
  const levels = usePage<InventoryLevel>("inventory-levels", "/inventory-levels", params);
  const summary = useQuery({ queryKey: ["inventory-summary", locationId], queryFn: () => api.get<{ all: number; in_stock: number; low_stock: number; out_of_stock: number }>(v1("/inventory-levels/summary"), { location_id: locationId || undefined }) });

  React.useEffect(() => {
    if (url.ajustar === "1") {
      setAdjustOpen(true);
      setUrl({ ajustar: "" });
    }
  }, [url.ajustar, setUrl]);

  const threshold = settings.data?.lowStockThreshold ?? 5;
  const tabs: ViewTab[] = [
    { id: "all", label: "Todos", count: summary.data?.all, filters: { view: "all" } },
    { id: "low_stock", label: "Stock bajo", count: summary.data?.low_stock, filters: { view: "low_stock" } },
    { id: "out_of_stock", label: "Agotados", count: summary.data?.out_of_stock, filters: { view: "out_of_stock" } },
  ];
  const activeTab = url.view.startsWith("saved:") ? url.view : tabs.some((t) => t.id === url.view) ? url.view : "all";

  const sorting: SortingState = React.useMemo(() => {
    const [id, dir] = url.sort.split(":");
    return [{ id: id!, desc: dir === "desc" }];
  }, [url.sort]);

  const openAdjust = (row: InventoryLevel, kind: "adjust" | "state") => {
    setAdjustTarget({ variantId: row.variantId, locationId: row.locationId, productTitle: row.variant!.product.title, variantTitle: row.variant!.title, sku: row.variant!.sku, thumbUrl: row.variant!.product.thumbUrl });
    setAdjustKind(kind);
    setAdjustOpen(true);
  };

  const columns = React.useMemo<ColumnDef<InventoryLevel, unknown>[]>(
    () => [
      {
        id: "product",
        header: "Producto",
        enableSorting: true,
        meta: { className: "max-w-[200px] sm:max-w-none" },
        cell: ({ row }) => {
          const l = row.original;
          return (
            <div className="flex items-center gap-2">
              <ProductCell title={l.variant!.product.title} variantTitle={l.variant!.title} sku={l.variant!.sku} thumbUrl={l.variant!.product.thumbUrl} to={`/inventario/${l.variantId}/${l.locationId}`} inactive={l.variant!.product.status !== "ACTIVE"} />
              <span className="md:hidden"><StockBadge available={l.available} minStock={l.minStock} threshold={threshold} /></span>
            </div>
          );
        },
      },
      { id: "sku", header: "SKU", enableSorting: true, cell: ({ row }) => <span className="tabular text-muted-foreground">{row.original.variant!.sku}</span>, meta: { className: "hidden lg:table-cell w-[140px]" } },
      ...(!locationId ? [{ id: "location", header: "Ubicación", cell: ({ row }) => <span className="text-muted-foreground">{row.original.location?.name}</span>, meta: { className: "hidden md:table-cell" } } as ColumnDef<InventoryLevel, unknown>] : []),
      { id: "status", header: "", cell: ({ row }) => <StockBadge available={row.original.available} minStock={row.original.minStock} threshold={threshold} />, meta: { className: "hidden md:table-cell w-[110px]" } },
      { id: "unavailable", header: "No disponible", enableSorting: true, cell: ({ row }) => <Qty value={row.original.unavailable} zeroDim />, meta: { numeric: true, className: "hidden md:table-cell" } },
      { id: "committed", header: "Comprometido", enableSorting: true, cell: ({ row }) => <Qty value={row.original.committed} zeroDim />, meta: { numeric: true, className: "hidden md:table-cell" } },
      {
        id: "available",
        header: "Disponible",
        enableSorting: true,
        cell: ({ row }) =>
          can("inventory.adjust") ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" onClick={(e) => { e.stopPropagation(); openAdjust(row.original, "adjust"); }} className="-mr-2 rounded-md px-2 py-1 font-medium tabular hover:bg-black/5">
                  {row.original.available.toLocaleString("es-CO")}
                </button>
              </TooltipTrigger>
              <TooltipContent>Ajustar disponible</TooltipContent>
            </Tooltip>
          ) : (
            <Qty value={row.original.available} className="font-medium" />
          ),
        meta: { numeric: true },
      },
      { id: "on_hand", header: "En existencia", cell: ({ row }) => <Qty value={row.original.onHand} />, meta: { numeric: true, className: "hidden md:table-cell" } },
      { id: "incoming", header: "Entrante", enableSorting: true, cell: ({ row }) => <Qty value={row.original.incoming} zeroDim />, meta: { numeric: true, className: "hidden lg:table-cell" } },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locationId, threshold, can],
  );

  const exportCsv = async () => {
    try {
      const blob = await api.blob(v1("/exports/inventory"), { location_id: locationId || undefined });
      downloadBlob(blob, `inventario-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      toast.error("No se pudo exportar");
    }
  };

  const chips = [
    ...(url.category ? [{ label: `Categoría: ${categories.data?.find((c) => c.id === url.category)?.name ?? ""}`, onRemove: () => setUrl({ category: "" }) }] : []),
  ];
  const selectedRows = (levels.data?.data ?? []).filter((l) => selection[l.id]);

  return (
    <Page width="wide">
      <PageHeader
        title="Inventario"
        primaryAction={can("inventory.adjust") ? <Button variant="primary" onClick={() => { setAdjustTarget(null); setAdjustKind("adjust"); setAdjustOpen(true); }}>Ajustar inventario</Button> : undefined}
        secondaryActions={
          <>
            <LocationSelect value={locationId} onChange={setLocationId} allowAll />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary">
                  Más acciones <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={exportCsv}><Download /> Exportar CSV</DropdownMenuItem>
                {can("import.run") ? <DropdownMenuItem onSelect={() => navigate("/configuracion/importar?kind=inventory")}><Upload /> Importar ajustes CSV</DropdownMenuItem> : null}
                {can("inventory.count") ? <DropdownMenuItem onSelect={() => navigate("/inventario/conteos")}><ClipboardList /> Conteos físicos</DropdownMenuItem> : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="surface overflow-hidden">
        <IndexTableHeader
          resource="inventory"
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={(t) => setUrl({ view: t.id.startsWith("saved:") ? t.id : t.filters.view ?? "all", q: t.filters.q ?? "", category: t.filters.category ?? "", sort: t.filters.sort ?? DEFAULTS.sort })}
          search={url.q}
          onSearchChange={(q) => setUrl({ q })}
          searchPlaceholder="Buscar por nombre, SKU o código de barras"
          currentFilters={{ view: stockState ?? "all", q: url.q, category: url.category, sort: url.sort }}
          activeFilterChips={chips}
          onClearFilters={() => setUrl({ category: "" })}
          filters={
            <FilterGroup label="Categoría">
              <SimpleSelect value={url.category} onChange={(v) => setUrl({ category: v })} options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))} placeholder="Todas las categorías" />
            </FilterGroup>
          }
        />
        {levels.isError ? (
          <ErrorState error={levels.error} onRetry={() => levels.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            data={levels.data?.data ?? []}
            loading={levels.isLoading || levels.isFetching}
            getRowId={(r) => r.id}
            onRowClick={(r) => navigate(`/inventario/${r.variantId}/${r.locationId}`)}
            sorting={sorting}
            onSortingChange={(u) => {
              const next = typeof u === "function" ? u(sorting) : u;
              const s = next[0];
              if (s) setUrl({ sort: `${s.id}:${s.desc ? "desc" : "asc"}` });
            }}
            selectable={can("inventory.adjust") && !!locationId}
            rowSelection={selection}
            onRowSelectionChange={setSelection}
            bulkActions={(_ids, clear) => (
              <>
                <Button size="sm" variant="secondary" onClick={() => setBulkOpen(true)}>Ajustar seleccionados</Button>
                <Button size="sm" variant="ghost" onClick={clear}>Cancelar</Button>
              </>
            )}
            pagination={{ hasMore: levels.data?.meta.has_more ?? false, onNext: () => pag.next(levels.data?.meta.next_cursor ?? null), onPrev: pag.prev, canPrev: pag.canPrev, total: levels.data?.meta.total ?? summary.data?.[(stockState ?? "all") as "all"], shown: levels.data?.data.length ?? 0 }}
            empty={
              dq || url.category || stockState ? (
                <NoResults onClear={() => setUrl({ q: "", category: "", view: "all" })} />
              ) : (
                <EmptyState title="Aún no hay inventario" description="Crea productos con sus variantes y asigna stock inicial por ubicación para empezar a controlar existencias." action={can("products.write") ? <Button asChild variant="primary"><Link to="/productos/nuevo">Crear producto</Link></Button> : undefined} />
              )
            }
          />
        )}
      </div>

      <AdjustDialog open={adjustOpen} onOpenChange={setAdjustOpen} target={adjustTarget} defaultLocationId={locationId || undefined} mode={adjustKind} />
      <BulkAdjustDialog open={bulkOpen} onOpenChange={setBulkOpen} rows={selectedRows} onDone={() => setSelection({})} />
    </Page>
  );
}
