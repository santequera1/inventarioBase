import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowLeftRight, Boxes, ClipboardList, Package, ShoppingCart, Truck, Wallet } from "lucide-react";
import { Page, PageHeader, Card } from "@/components/app/page";
import { Money, Qty, RelativeDate } from "@/components/app/format";
import { ProductCell } from "@/components/app/product-cell";
import { ErrorState } from "@/components/app/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { HomeSummary, Movement, Page as P } from "@/lib/queries";
import { movementTypeLabels, bucketLabels } from "@inventario/shared";
import { LocationSelect } from "@/components/app/pickers";
import { useSelectedLocation } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const { user, can } = useAuth();
  const [locationId, setLocationId] = useSelectedLocation(user?.defaultLocationId);
  const summary = useQuery({ queryKey: ["home", locationId], queryFn: () => api.get<HomeSummary>(v1("/reports/home"), { location_id: locationId || undefined }) });
  const recent = useQuery({ queryKey: ["home-movements", locationId], queryFn: () => api.get<P<Movement>>(v1("/inventory-movements"), { limit: 8, location_id: locationId || undefined }) });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const s = summary.data;
  const delta = s ? s.today.net - s.yesterday.net : 0;

  return (
    <Page>
      <PageHeader title={`${greeting}, ${user?.name.split(" ")[0] ?? ""}`} subtitle="Resumen de hoy" secondaryActions={<LocationSelect value={locationId} onChange={setLocationId} allowAll />} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat label="Ventas de hoy" loading={summary.isLoading} value={<Money value={s?.today.net} />} hint={s ? <span className={cn("tabular", delta > 0 ? "text-tone-success-fg" : delta < 0 ? "text-muted-foreground" : "text-muted-foreground")}>{delta === 0 ? "igual que ayer" : `${delta > 0 ? "+" : "−"}${Math.abs(delta).toLocaleString("es-CO")} vs. ayer`}</span> : null} />
        <Stat label="Órdenes de hoy" loading={summary.isLoading} value={<Qty value={s?.today.orders} />} hint={s ? <span className="tabular">{s.today.items.toLocaleString("es-CO")} artículos vendidos</span> : null} />
        <Stat className="col-span-2 sm:col-span-1" label="Stock bajo" loading={summary.isLoading} value={<Qty value={s?.lowStockCount} />} hint={s ? <span className="tabular">{s.outOfStockCount.toLocaleString("es-CO")} agotados</span> : null} to="/inventario?view=low_stock" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Stock bajo" padded={false} actions={<Button asChild variant="plain" size="sm"><Link to="/inventario?view=low_stock">Ver todo</Link></Button>}>
            {summary.isError ? (
              <ErrorState error={summary.error} compact />
            ) : summary.isLoading ? (
              <div className="divide-y divide-border">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="flex h-13 items-center gap-3 px-4"><Skeleton className="h-10 w-10" /><Skeleton className="h-4 w-48" /><Skeleton className="ml-auto h-4 w-10" /></div>)}</div>
            ) : s && s.lowStock.length > 0 ? (
              <ul className="divide-y divide-border">
                {s.lowStock.map((r) => (
                  <li key={`${r.variantId}-${r.locationId}`} className="flex min-w-0 items-center gap-3 px-4 py-2 hover:bg-surface-hover">
                    <div className="min-w-0 flex-1">
                      <ProductCell title={r.productTitle} variantTitle={r.variantTitle} sku={r.sku} thumbUrl={r.thumbUrl} to={`/inventario/${r.variantId}/${r.locationId}`} />
                    </div>
                    {!locationId ? <span className="hidden truncate text-sm text-muted-foreground sm:inline">{r.locationName}</span> : null}
                    <div className="shrink-0 text-right">
                      <Qty value={r.available} className="font-medium" />
                      <div className="text-xs text-muted-foreground">{r.available <= 0 ? <Badge tone="neutral">Agotado</Badge> : <Badge tone="warning">Stock bajo</Badge>}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-base text-muted-foreground">Todo en orden: ningún producto por debajo de su mínimo.</p>
            )}
          </Card>

          <Card title="Movimientos recientes" padded={false} actions={<Button asChild variant="plain" size="sm"><Link to="/movimientos">Ver historial</Link></Button>}>
            {recent.isLoading ? (
              <div className="divide-y divide-border">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex h-13 items-center gap-3 px-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-48" /><Skeleton className="ml-auto h-4 w-10" /></div>)}</div>
            ) : recent.data && recent.data.data.length > 0 ? (
              <ul className="divide-y divide-border">
                {recent.data.data.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-2 text-base hover:bg-surface-hover">
                    <span className="hidden w-20 shrink-0 text-sm text-muted-foreground sm:block"><RelativeDate value={m.createdAt} /></span>
                    <div className="min-w-0 flex-1">
                      <Link to={`/inventario/${m.variantId}/${m.locationId}`} className="block truncate font-medium hover:underline underline-offset-2">{m.variant?.product.title}{m.variant && m.variant.title !== "Default" ? <span className="text-muted-foreground"> · {m.variant.title}</span> : null}</Link>
                      <div className="truncate text-sm text-muted-foreground"><span className="sm:hidden"><RelativeDate value={m.createdAt} /> · </span>{movementTypeLabels[m.type] ?? m.type}{m.reason ? ` · ${m.reason}` : ""}{m.bucket !== "AVAILABLE" ? ` · ${bucketLabels[m.bucket]}` : ""}</div>
                    </div>
                    <Qty value={m.quantity} signed className="font-medium" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-base text-muted-foreground">Aún no hay movimientos registrados.</p>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Accesos directos">
            <div className="grid gap-1">
              {can("pos.use") ? <Shortcut to="/pos" icon={<ShoppingCart />} label="Nueva venta" /> : null}
              {can("inventory.adjust") ? <Shortcut to="/inventario?ajustar=1" icon={<Boxes />} label="Ajustar inventario" /> : null}
              {can("products.write") ? <Shortcut to="/productos/nuevo" icon={<Package />} label="Nuevo producto" /> : null}
              {can("inventory.transfer") ? <Shortcut to="/transferencias/nueva" icon={<ArrowLeftRight />} label="Nueva transferencia" /> : null}
              {can("purchases.write") ? <Shortcut to="/compras/nueva" icon={<Truck />} label="Nueva orden de compra" /> : null}
              {can("inventory.count") ? <Shortcut to="/inventario/conteos" icon={<ClipboardList />} label="Conteo físico" /> : null}
              {can("cash.manage") ? <Shortcut to="/caja" icon={<Wallet />} label="Caja" /> : null}
            </div>
          </Card>
          {s && (s.pendingTransfers > 0 || s.pendingPurchaseOrders > 0 || s.openCashSessions > 0) ? (
            <Card title="Pendientes">
              <ul className="space-y-2 text-base">
                {s.pendingTransfers > 0 ? <li className="flex justify-between"><Link to="/transferencias" className="hover:underline">Transferencias en curso</Link><Qty value={s.pendingTransfers} className="font-medium" /></li> : null}
                {s.pendingPurchaseOrders > 0 ? <li className="flex justify-between"><Link to="/compras" className="hover:underline">Órdenes de compra por recibir</Link><Qty value={s.pendingPurchaseOrders} className="font-medium" /></li> : null}
                {s.openCashSessions > 0 ? <li className="flex justify-between"><Link to="/caja" className="hover:underline">Cajas abiertas</Link><Qty value={s.openCashSessions} className="font-medium" /></li> : null}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </Page>
  );
}

function Stat({ label, value, hint, loading, to, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; loading?: boolean; to?: string; className?: string }) {
  const inner = (
    <>
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      {loading ? <Skeleton className="mt-1.5 h-7 w-28" /> : <div className="mt-1 truncate text-lg font-semibold leading-7">{value}</div>}
      {hint ? <div className="mt-0.5 text-sm text-muted-foreground">{hint}</div> : null}
    </>
  );
  return to ? (
    <Link to={to} className={cn("surface block min-w-0 p-4 transition-colors hover:bg-surface-hover", className)}>
      {inner}
    </Link>
  ) : (
    <div className={cn("surface min-w-0 p-4", className)}>{inner}</div>
  );
}

function Shortcut({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="flex h-9 items-center gap-2.5 rounded-md px-2 text-base font-medium hover:bg-surface-hover [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-muted-foreground">
      {icon}
      <span className="flex-1">{label}</span>
      <ArrowRight className="!text-muted-foreground/60" />
    </Link>
  );
}
