import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { SortingState } from "@tanstack/react-table";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Page, PageHeader, Card, KeyValue } from "@/components/app/page";
import { DataTable, useCursorPagination } from "@/components/app/data-table";
import { ErrorState, PageSkeleton, EmptyState } from "@/components/app/states";
import { Thumb } from "@/components/app/product-cell";
import { Qty, Money } from "@/components/app/format";
import { StockBadge } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/app/form";
import { api, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInvalidate, useLocations, usePage, useSettings, type InventoryLevel, type Movement } from "@/lib/queries";
import { AdjustDialog } from "./adjust-dialog";
import { movementColumns } from "./movements-table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export default function InventoryDetailPage() {
  const { variantId = "", locationId = "" } = useParams();
  const { can } = useAuth();
  const settings = useSettings();
  const locations = useLocations();
  const invalidate = useInvalidate();
  const level = useQuery({ queryKey: ["level", variantId, locationId], queryFn: () => api.get<InventoryLevel>(v1(`/inventory-levels/${variantId}/${locationId}`)) });
  const otherLevels = usePage<InventoryLevel>("inventory-levels", "/inventory-levels", { variant_id: variantId, limit: 50 });
  const [sort, setSort] = React.useState<SortingState>([{ id: "created_at", desc: true }]);
  const pag = useCursorPagination(`${variantId}|${locationId}|${sort[0]?.id}|${sort[0]?.desc}`);
  const movements = usePage<Movement>("movements", "/inventory-movements", { variant_id: variantId, location_id: locationId, sort: `${sort[0]?.id ?? "created_at"}:${sort[0]?.desc ? "desc" : "asc"}`, limit: 25, cursor: pag.cursor });
  const [adjust, setAdjust] = React.useState<null | "adjust" | "state">(null);
  const [minOpen, setMinOpen] = React.useState(false);
  const [minValue, setMinValue] = React.useState("");
  const [savingMin, setSavingMin] = React.useState(false);

  if (level.isLoading) return <Page><PageSkeleton /></Page>;
  if (level.isError || !level.data) return <Page><ErrorState error={level.error} onRetry={() => level.refetch()} /></Page>;
  const l = level.data;
  const v = l.variant!;
  const threshold = settings.data?.lowStockThreshold ?? 5;
  const columns = movementColumns({ showProduct: false, showLocation: false });

  const saveMin = async () => {
    setSavingMin(true);
    try {
      await api.put(v1("/inventory-levels/min-stock"), { variantId, locationId, minStock: minValue === "" ? null : Number(minValue) });
      toast.success(minValue === "" ? "Stock mínimo eliminado" : `Stock mínimo fijado en ${Number(minValue).toLocaleString("es-CO")}`);
      await invalidate("level", "inventory-levels", "inventory-summary", "home");
      setMinOpen(false);
    } catch {
      toast.error("No se pudo guardar el stock mínimo");
    } finally {
      setSavingMin(false);
    }
  };

  const title = v.title !== "Default" ? `${v.product.title} — ${v.title}` : v.product.title;
  const target = { variantId, locationId, productTitle: v.product.title, variantTitle: v.title, sku: v.sku, thumbUrl: v.product.thumbUrl };

  return (
    <Page width="wide">
      <PageHeader
        backTo="/inventario"
        title={
          <span className="flex items-center gap-3">
            <Thumb src={v.product.thumbUrl} alt={v.product.title} />
            <span className="truncate">{title}</span>
          </span>
        }
        subtitle={<span>SKU <span className="tabular">{v.sku}</span>{v.barcode ? <> · Código <span className="tabular">{v.barcode}</span></> : null} · {l.location?.name}</span>}
        badge={<StockBadge available={l.available} minStock={l.minStock} threshold={threshold} />}
        primaryAction={can("inventory.adjust") ? <Button variant="primary" onClick={() => setAdjust("adjust")}>Ajustar inventario</Button> : undefined}
        secondaryActions={
          <>
            {can("inventory.adjust") ? <Button variant="secondary" onClick={() => setAdjust("state")}>Marcar como no disponible</Button> : null}
            {can("products.read") ? <Button asChild variant="secondary"><Link to={`/productos/${v.product.id}`}>Ver producto</Link></Button> : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Cantidades */}
          <div className="surface">
            <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-5 sm:divide-y-0">
              <QtyCell label="Disponible" value={l.available} emphasis hint="Se puede vender" />
              <QtyCell label="Comprometido" value={l.committed} hint="Órdenes sin entregar" />
              <QtyCell label="No disponible" value={l.unavailable} hint="Dañado, revisión…" />
              <QtyCell label="En existencia" value={l.onHand} hint="Disp. + Comp. + No disp." strong />
              <QtyCell label="Entrante" value={l.incoming} hint="En camino; no es stock físico" subdued />
            </div>
          </div>

          {/* Historial */}
          <Card title="Historial de movimientos" description="Movimientos de esta variante en esta ubicación, del más reciente al más antiguo." padded={false} actions={<Button asChild variant="plain" size="sm"><Link to={`/movimientos?q=${encodeURIComponent(v.sku)}`}>Ver en historial global</Link></Button>}>
            {movements.isError ? (
              <ErrorState error={movements.error} compact onRetry={() => movements.refetch()} />
            ) : (
              <DataTable
                columns={columns}
                data={movements.data?.data ?? []}
                loading={movements.isLoading || movements.isFetching}
                getRowId={(r) => r.id}
                sorting={sort}
                onSortingChange={(u) => setSort(typeof u === "function" ? u(sort) : u)}
                dense
                pagination={{ hasMore: movements.data?.meta.has_more ?? false, onNext: () => pag.next(movements.data?.meta.next_cursor ?? null), onPrev: pag.prev, canPrev: pag.canPrev, total: movements.data?.meta.total, shown: movements.data?.data.length ?? 0 }}
                empty={<EmptyState compact title="Sin movimientos" description="Esta variante aún no tiene movimientos en esta ubicación." action={can("inventory.adjust") ? <Button variant="secondary" onClick={() => setAdjust("adjust")}>Registrar stock</Button> : undefined} />}
              />
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Detalles" actions={can("inventory.adjust") ? <Button variant="ghost" size="icon-sm" aria-label="Editar stock mínimo" onClick={() => { setMinValue(l.minStock === null ? "" : String(l.minStock)); setMinOpen(true); }}><Pencil /></Button> : undefined}>
            <KeyValue
              items={[
                { label: "Ubicación", value: l.location?.name },
                { label: "Stock mínimo", value: l.minStock === null ? <span className="text-muted-foreground">Global ({threshold})</span> : l.minStock, numeric: true },
                { label: "Precio", value: <Money value={v.price} />, numeric: true },
                { label: "Costo", value: <Money value={v.cost} />, numeric: true },
                { label: "Valor a costo", value: <Money value={(v.cost ?? 0) * l.onHand} />, numeric: true },
                { label: "Valor a precio", value: <Money value={v.price * l.onHand} />, numeric: true },
              ]}
            />
          </Card>
          <Card title="Otras ubicaciones" padded={false}>
            <ul className="divide-y divide-border">
              {(otherLevels.data?.data ?? []).filter((o) => o.locationId !== locationId).length === 0 ? <li className="px-4 py-3 text-sm text-muted-foreground">No hay otras ubicaciones.</li> : null}
              {(otherLevels.data?.data ?? [])
                .filter((o) => o.locationId !== locationId)
                .map((o) => (
                  <li key={o.id}>
                    <Link to={`/inventario/${variantId}/${o.locationId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-hover">
                      <span className="truncate">{locations.data?.find((x) => x.id === o.locationId)?.name ?? o.location?.name}</span>
                      <span className="flex items-center gap-3 text-sm">
                        <Tooltip><TooltipTrigger asChild><span className="tabular font-medium">{o.available.toLocaleString("es-CO")}</span></TooltipTrigger><TooltipContent>Disponible</TooltipContent></Tooltip>
                        {o.incoming > 0 ? <span className="tabular text-muted-foreground">+{o.incoming} entrante</span> : null}
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </Card>
        </div>
      </div>

      <AdjustDialog open={adjust !== null} onOpenChange={(o) => !o && setAdjust(null)} target={target} mode={adjust ?? "adjust"} />
      <Dialog open={minOpen} onOpenChange={setMinOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Stock mínimo</DialogTitle></DialogHeader>
          <DialogBody>
            <Field label="Stock mínimo en esta ubicación" htmlFor="min-stock" help={`Si lo dejas vacío se usa el mínimo global (${threshold}). Al bajar de este valor el producto aparece en “Stock bajo” y se emite el webhook inventory.low_stock.`}>
              <Input id="min-stock" type="number" min={0} value={minValue} onChange={(e) => setMinValue(e.target.value.replace(/\D/g, ""))} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMinOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={saveMin} loading={savingMin}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

function QtyCell({ label, value, hint, emphasis, strong, subdued }: { label: string; value: number; hint?: string; emphasis?: boolean; strong?: boolean; subdued?: boolean }) {
  return (
    <div className="px-4 py-3 sm:py-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-lg font-semibold leading-7 tabular", subdued && "text-muted-foreground", emphasis && value <= 0 && "text-destructive")}>{value.toLocaleString("es-CO")}</div>
      {hint ? <div className={cn("mt-0.5 text-xs text-muted-foreground", strong && "font-medium")}>{hint}</div> : null}
    </div>
  );
}

export { Qty };
