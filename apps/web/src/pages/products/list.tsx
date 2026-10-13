import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ColumnDef, RowSelectionState, SortingState } from "@tanstack/react-table";
import { ChevronDown, Download, ImageIcon, LayoutGrid, List, Upload } from "lucide-react";
import { toast } from "sonner";
import { ProductStatus, productStatusLabels } from "@inventario/shared";
import { Page, PageHeader } from "@/components/app/page";
import { DataTable, useCursorPagination } from "@/components/app/data-table";
import { IndexTableHeader, FilterGroup, type ViewTab } from "@/components/app/index-table";
import { SimpleSelect } from "@/components/app/pickers";
import { ProductCell, Thumb } from "@/components/app/product-cell";
import { Money, Qty } from "@/components/app/format";
import { ProductStatusBadge } from "@/components/app/badges";
import { EmptyState, ErrorState, NoResults } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounce, useUrlState } from "@/lib/hooks";
import { useCategories, useInvalidate, usePage, useSuppliersAll, type Product } from "@/lib/queries";
import { cn, downloadBlob } from "@/lib/utils";
import { AddToCatalogDialog } from "@/pages/catalogs/add-to-catalog-dialog";

const DEFAULTS = { view: "all", q: "", category: "", supplier: "", sort: "updated_at:desc" };
const LAYOUT_KEY = "iw.products.layout";

/** Preferencia de vista (filas o tarjetas), recordada en este navegador. */
function useLayout() {
  const [layout, setLayout] = React.useState<"list" | "grid">(() => {
    try {
      return localStorage.getItem(LAYOUT_KEY) === "grid" ? "grid" : "list";
    } catch {
      return "list";
    }
  });
  const set = (v: "list" | "grid") => {
    setLayout(v);
    try {
      localStorage.setItem(LAYOUT_KEY, v);
    } catch {
      /* sin almacenamiento: solo dura la sesión */
    }
  };
  return [layout, set] as const;
}

const priceRange = (p: Product) => {
  const prices = p.variants.map((v) => v.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? <Money value={min} /> : <span className="tabular"><Money value={min} /> – <Money value={max} /></span>;
};
/** Precio antes del descuento, solo si todas las variantes tienen el mismo precio. */
const compareAt = (p: Product) => {
  const v = p.variants[0];
  if (!v?.compareAtPrice || v.compareAtPrice <= v.price) return null;
  return p.variants.every((x) => x.price === v.price && x.compareAtPrice === v.compareAtPrice) ? v.compareAtPrice : null;
};

export default function ProductsListPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [url, setUrl] = useUrlState(DEFAULTS);
  const dq = useDebounce(url.q, 300);
  const categories = useCategories();
  const suppliers = useSuppliersAll();
  const invalidate = useInvalidate();
  const [selection, setSelection] = React.useState<RowSelectionState>({});
  const [layout, setLayout] = useLayout();
  const [catalogPick, setCatalogPick] = React.useState<{ ids: string[]; clear: () => void } | null>(null);
  const status = ProductStatus.options.includes(url.view as "ACTIVE") ? url.view : undefined;
  const pag = useCursorPagination(JSON.stringify([url.view, dq, url.category, url.supplier, url.sort]));
  const products = usePage<Product>("products", "/products", { q: dq || undefined, status, category_id: url.category || undefined, supplier_id: url.supplier || undefined, sort: url.sort, limit: 50, cursor: pag.cursor });

  const tabs: ViewTab[] = [
    { id: "all", label: "Todos", filters: { view: "all" } },
    { id: "ACTIVE", label: "Activos", filters: { view: "ACTIVE" } },
    { id: "DRAFT", label: "Borradores", filters: { view: "DRAFT" } },
    { id: "ARCHIVED", label: "Archivados", filters: { view: "ARCHIVED" } },
  ];
  const sorting: SortingState = React.useMemo(() => {
    const [id, dir] = url.sort.split(":");
    return [{ id: id!, desc: dir === "desc" }];
  }, [url.sort]);

  const bulkStatus = async (ids: string[], s: string, clear: () => void) => {
    try {
      await Promise.all(ids.map((id) => api.patch(v1(`/products/${id}`), { status: s })));
      toast.success(`${ids.length} ${ids.length === 1 ? "producto actualizado" : "productos actualizados"}`);
      await invalidate("products", "inventory-levels");
      clear();
    } catch {
      toast.error("No se pudieron actualizar todos los productos");
    }
  };

  const columns = React.useMemo<ColumnDef<Product, unknown>[]>(
    () => [
      { id: "title", header: "Producto", enableSorting: true, cell: ({ row }) => <ProductCell title={row.original.title} variantTitle={row.original.variants.length === 1 ? row.original.variants[0]!.title : null} sku={row.original.variants.length === 1 ? row.original.variants[0]!.sku : `${row.original.variants.length} variantes`} thumbUrl={row.original.images[0]?.thumbUrl} inactive={row.original.status === "ARCHIVED"} /> },
      { id: "status", header: "Estado", enableSorting: true, cell: ({ row }) => <ProductStatusBadge status={row.original.status} />, meta: { className: "w-[120px]" } },
      { id: "inventory", header: "Inventario", cell: ({ row }) => { const t = row.original.totalAvailable ?? 0; return <span className={t <= 0 ? "text-muted-foreground" : ""}><Qty value={t} /> <span className="text-muted-foreground">disp. en {row.original.variants.length} {row.original.variants.length === 1 ? "variante" : "variantes"}</span></span>; }, meta: { className: "hidden md:table-cell" } },
      { id: "category", header: "Categoría", cell: ({ row }) => <span className="text-muted-foreground">{row.original.category?.name ?? "—"}</span>, meta: { className: "hidden lg:table-cell" } },
      { id: "supplier", header: "Proveedor", cell: ({ row }) => <span className="text-muted-foreground">{row.original.supplier?.name ?? "—"}</span>, meta: { className: "hidden xl:table-cell" } },
      { id: "price", header: "Precio", cell: ({ row }) => priceRange(row.original), meta: { numeric: true } },
    ],
    [],
  );

  const chips = [
    ...(url.category ? [{ label: `Categoría: ${categories.data?.find((c) => c.id === url.category)?.name ?? ""}`, onRemove: () => setUrl({ category: "" }) }] : []),
    ...(url.supplier ? [{ label: `Proveedor: ${suppliers.data?.find((s) => s.id === url.supplier)?.name ?? ""}`, onRemove: () => setUrl({ supplier: "" }) }] : []),
  ];

  return (
    <Page width="wide">
      <PageHeader
        title="Productos"
        primaryAction={can("products.write") ? <Button asChild variant="primary"><Link to="/productos/nuevo">Agregar producto</Link></Button> : undefined}
        secondaryActions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="secondary">Más acciones <ChevronDown /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={async () => { try { downloadBlob(await api.blob(v1("/exports/products")), "productos.csv"); } catch { toast.error("No se pudo exportar"); } }}><Download /> Exportar CSV</DropdownMenuItem>
              {can("import.run") ? <DropdownMenuItem onSelect={() => navigate("/configuracion/importar?kind=products")}><Upload /> Importar CSV</DropdownMenuItem> : null}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <div className="surface overflow-hidden">
        <IndexTableHeader
          resource="products"
          tabs={tabs}
          activeTab={url.view}
          onTabChange={(t) => setUrl({ view: t.id.startsWith("saved:") ? t.id : t.filters.view ?? "all", q: t.filters.q ?? "", category: t.filters.category ?? "", supplier: t.filters.supplier ?? "" })}
          search={url.q}
          onSearchChange={(q) => setUrl({ q })}
          searchPlaceholder="Buscar por nombre, SKU, código de barras o etiqueta"
          currentFilters={{ view: url.view, q: url.q, category: url.category, supplier: url.supplier }}
          activeFilterChips={chips}
          onClearFilters={() => setUrl({ category: "", supplier: "" })}
          trailing={
            <div className="inline-flex rounded-md border border-input bg-card p-0.5" role="group" aria-label="Vista">
              <button type="button" onClick={() => setLayout("list")} aria-pressed={layout === "list"} aria-label="Ver como filas" title="Filas" className={cn("flex h-8 w-9 items-center justify-center rounded-[6px] text-muted-foreground [&_svg]:size-4", layout === "list" ? "bg-surface-selected text-foreground" : "hover:text-foreground")}><List /></button>
              <button type="button" onClick={() => setLayout("grid")} aria-pressed={layout === "grid"} aria-label="Ver como tarjetas" title="Tarjetas" className={cn("flex h-8 w-9 items-center justify-center rounded-[6px] text-muted-foreground [&_svg]:size-4", layout === "grid" ? "bg-surface-selected text-foreground" : "hover:text-foreground")}><LayoutGrid /></button>
            </div>
          }
          filters={
            <>
              <FilterGroup label="Categoría"><SimpleSelect value={url.category} onChange={(v) => setUrl({ category: v })} options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))} placeholder="Todas" /></FilterGroup>
              <FilterGroup label="Proveedor"><SimpleSelect value={url.supplier} onChange={(v) => setUrl({ supplier: v })} options={(suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name }))} placeholder="Todos" /></FilterGroup>
            </>
          }
        />
        {products.isError ? (
          <ErrorState error={products.error} onRetry={() => products.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            data={products.data?.data ?? []}
            loading={products.isLoading || products.isFetching}
            getRowId={(r) => r.id}
            onRowClick={(r) => navigate(`/productos/${r.id}`)}
            mobileRow={(p) => (
              <div className="flex items-center gap-3">
                <Thumb src={p.images[0]?.thumbUrl} alt={p.title} className="h-12 w-12" />
                <div className="min-w-0 flex-1">
                  <div className={cn("truncate font-medium", p.status === "ARCHIVED" && "text-muted-foreground")}>{p.title}</div>
                  <div className="truncate text-sm text-muted-foreground">
                    <Qty value={p.totalAvailable ?? 0} /> disp.{p.variants.length > 1 ? ` · ${p.variants.length} variantes` : p.variants[0]?.sku ? ` · ${p.variants[0].sku}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-medium">{priceRange(p)}</div>
                  {p.status !== "ACTIVE" ? <ProductStatusBadge status={p.status} /> : null}
                </div>
              </div>
            )}
            gridItem={layout === "grid" ? (p, sel) => <ProductCard product={p} {...sel} /> : undefined}
            sorting={sorting}
            onSortingChange={(u) => { const n = typeof u === "function" ? u(sorting) : u; const s = n[0]; if (s) setUrl({ sort: `${s.id}:${s.desc ? "desc" : "asc"}` }); }}
            selectable={can("products.write")}
            rowSelection={selection}
            onRowSelectionChange={setSelection}
            bulkActions={(ids, clear) => (
              <>
                <Button size="sm" variant="secondary" onClick={() => bulkStatus(ids, "ACTIVE", clear)}>Activar</Button>
                <Button size="sm" variant="secondary" onClick={() => bulkStatus(ids, "DRAFT", clear)}>Pasar a borrador</Button>
                <Button size="sm" variant="secondary" onClick={() => bulkStatus(ids, "ARCHIVED", clear)}>Archivar</Button>
                <Button size="sm" variant="secondary" onClick={() => setCatalogPick({ ids, clear })}>Agregar a catálogo</Button>
              </>
            )}
            pagination={{ hasMore: products.data?.meta.has_more ?? false, onNext: () => pag.next(products.data?.meta.next_cursor ?? null), onPrev: pag.prev, canPrev: pag.canPrev, total: products.data?.meta.total, shown: products.data?.data.length ?? 0 }}
            empty={dq || chips.length || status ? <NoResults onClear={() => setUrl({ q: "", category: "", supplier: "", view: "all" })} /> : <EmptyState title="Agrega tu primer producto" description="Los productos agrupan variantes (talla, color…) con SKU, precio y costo. El inventario se controla por variante y ubicación." action={can("products.write") ? <Button asChild variant="primary"><Link to="/productos/nuevo">Agregar producto</Link></Button> : undefined} />}
          />
        )}
      </div>
      <AddToCatalogDialog productIds={catalogPick?.ids ?? []} open={!!catalogPick} onOpenChange={(o) => !o && setCatalogPick(null)} onDone={() => catalogPick?.clear()} />
      <span className="sr-only">{Object.values(productStatusLabels).join(", ")}</span>
    </Page>
  );
}

function ProductCard({ product: p, selectable, selected, toggle }: { product: Product; selectable: boolean; selected: boolean; toggle: (v: boolean) => void }) {
  const img = p.images[0];
  const available = p.totalAvailable ?? 0;
  const before = compareAt(p);
  return (
    <div className={cn("group flex h-full flex-col overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-popover", selected ? "border-foreground" : "border-border")}>
      <div className="relative aspect-square bg-muted">
        {img ? <img src={img.url} alt={p.title} loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-muted-foreground"><ImageIcon className="h-8 w-8 opacity-50" /></div>}
        {selectable ? (
          <div className={cn("absolute left-2 top-2 rounded-md bg-card/90 p-1 shadow-card", !selected && "md:opacity-0 md:group-hover:opacity-100")} onClick={(e) => e.stopPropagation()}>
            <Checkbox aria-label={`Seleccionar ${p.title}`} checked={selected} onCheckedChange={(v) => toggle(!!v)} />
          </div>
        ) : null}
        {p.status !== "ACTIVE" ? <div className="absolute right-2 top-2"><ProductStatusBadge status={p.status} /></div> : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5 sm:p-3">
        <div className={cn("line-clamp-2 font-medium leading-5", p.status === "ARCHIVED" && "text-muted-foreground")}>{p.title}</div>
        <div className="mt-auto flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-semibold">{priceRange(p)}</span>
          {before ? <span className="text-sm text-muted-foreground line-through"><Money value={before} /></span> : null}
        </div>
        <div className={cn("text-sm", available <= 0 ? "text-tone-critical-fg" : "text-muted-foreground")}>
          {available <= 0 ? "Agotado" : <><Qty value={available} /> disp.</>}
          {p.variants.length > 1 ? <span className="text-muted-foreground"> · {p.variants.length} variantes</span> : null}
        </div>
      </div>
    </div>
  );
}
