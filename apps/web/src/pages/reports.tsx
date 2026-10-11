import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { formatCOP, toBogotaDateString } from "@inventario/shared";
import type { z } from "zod";
import type { salesSummarySchema, topProductsSchema, inventoryValuationSchema } from "@inventario/shared";
import { Page, PageHeader, Card, KeyValue } from "@/components/app/page";
import { DateRange, LocationSelect } from "@/components/app/pickers";
import { Money, Qty, DateText } from "@/components/app/format";
import { ErrorState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { api, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useSelectedLocation, useUrlState } from "@/lib/hooks";
import { downloadBlob } from "@/lib/utils";

type Sales = z.infer<typeof salesSummarySchema>;
type Top = z.infer<typeof topProductsSchema>;
type Valuation = z.infer<typeof inventoryValuationSchema>;
type StockRow = { variantId: string; sku: string; productTitle: string; variantTitle: string; locationName: string; available: number; onHand: number; minStock: number | null; lastMovementAt: string | null; soldLast30: number; rotation: number | null; cost: number | null; price: number };

const daysAgo = (n: number) => toBogotaDateString(new Date(Date.now() - n * 86400_000));

export default function ReportsPage() {
  const { user } = useAuth();
  const [locationId, setLocationId] = useSelectedLocation(user?.defaultLocationId);
  const [url, setUrl] = useUrlState({ tab: "ventas", from: daysAgo(29), to: toBogotaDateString(), group: "day" });
  const range = { from: url.from, to: url.to, location_id: locationId || undefined };
  const sales = useQuery({ queryKey: ["report-sales", range, url.group], queryFn: () => api.get<Sales>(v1("/reports/sales"), { ...range, group_by: url.group }), enabled: url.tab === "ventas" });
  const top = useQuery({ queryKey: ["report-top", range], queryFn: () => api.get<Top>(v1("/reports/top-products"), { ...range, limit: 20 }), enabled: url.tab === "ventas" || url.tab === "productos" });
  const valuation = useQuery({ queryKey: ["report-valuation", locationId], queryFn: () => api.get<Valuation>(v1("/reports/inventory-valuation"), { location_id: locationId || undefined }), enabled: url.tab === "inventario" });
  const stockKind = url.tab === "stock_bajo" ? "low_stock" : url.tab === "sin_movimiento" ? "no_movement" : "rotation";
  const stock = useQuery({ queryKey: ["report-stock", stockKind, locationId], queryFn: () => api.get<StockRow[]>(v1("/reports/stock"), { kind: stockKind, location_id: locationId || undefined, limit: 200 }), enabled: ["stock_bajo", "sin_movimiento", "rotacion"].includes(url.tab) });

  const presets = [{ label: "Hoy", from: daysAgo(0) }, { label: "7 días", from: daysAgo(6) }, { label: "30 días", from: daysAgo(29) }, { label: "90 días", from: daysAgo(89) }];
  const exportStock = async () => { try { downloadBlob(await api.blob(v1("/reports/stock"), { kind: stockKind, location_id: locationId || undefined, limit: 500, format: "csv" }), `reporte-${stockKind}.csv`); } catch { toast.error("No se pudo exportar"); } };

  return (
    <Page width="wide">
      <PageHeader title="Reportes" secondaryActions={<LocationSelect value={locationId} onChange={setLocationId} allowAll />} />
      <Tabs value={url.tab} onValueChange={(t) => setUrl({ tab: t })} className="mb-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="ventas">Ventas</TabsTrigger><TabsTrigger value="productos">Más vendidos</TabsTrigger><TabsTrigger value="inventario">Valorización</TabsTrigger><TabsTrigger value="stock_bajo">Stock bajo</TabsTrigger><TabsTrigger value="sin_movimiento">Sin movimiento</TabsTrigger><TabsTrigger value="rotacion">Rotación</TabsTrigger>
        </TabsList>
      </Tabs>

      {(url.tab === "ventas" || url.tab === "productos") && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {presets.map((p) => <Button key={p.label} size="sm" variant={url.from === p.from && url.to === toBogotaDateString() ? "primary" : "secondary"} onClick={() => setUrl({ from: p.from, to: toBogotaDateString() })}>{p.label}</Button>)}
          <DateRange from={url.from} to={url.to} onChange={(r) => setUrl(r)} />
          {url.tab === "ventas" ? <div className="ml-auto flex gap-1 rounded-md bg-muted p-1">{(["day", "week", "month"] as const).map((g) => <button key={g} type="button" onClick={() => setUrl({ group: g })} className={`h-7 rounded-sm px-2.5 text-sm font-medium ${url.group === g ? "bg-card shadow-button" : "text-muted-foreground"}`}>{g === "day" ? "Día" : g === "week" ? "Semana" : "Mes"}</button>)}</div> : null}
        </div>
      )}

      {url.tab === "ventas" ? (
        sales.isError ? <ErrorState error={sales.error} /> : (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Ventas netas" value={sales.data ? <Money value={sales.data.net} /> : null} hint={sales.data ? `${sales.data.ordersCount.toLocaleString("es-CO")} órdenes · ticket ${formatCOP(sales.data.averageTicket)}` : undefined} loading={sales.isLoading} />
              <Stat label="Margen bruto" value={sales.data ? <Money value={sales.data.grossMargin} /> : null} hint={sales.data ? `${sales.data.marginPct} % sobre ventas sin IVA` : undefined} loading={sales.isLoading} />
              <Stat label="IVA recaudado" value={sales.data ? <Money value={sales.data.tax} /> : null} loading={sales.isLoading} />
              <Stat label="Devoluciones" value={sales.data ? <Money value={sales.data.returns} /> : null} hint={sales.data ? `Descuentos: ${formatCOP(sales.data.discounts)}` : undefined} loading={sales.isLoading} />
            </div>
            <Card title="Ventas netas y margen por periodo">
              {sales.isLoading ? <Skeleton className="h-64" /> : sales.data && sales.data.series.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={sales.data.series} margin={{ left: 8, right: 8, top: 8 }}>
                    <CartesianGrid stroke="#E3E3E3" vertical={false} />
                    <XAxis dataKey="period" tick={{ fontSize: 12, fill: "#616161" }} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 12, fill: "#616161" }} tickLine={false} axisLine={false} width={70} tickFormatter={(v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000)}k`)} />
                    <Tooltip formatter={(v: number, n: string) => [formatCOP(v), n === "net" ? "Ventas netas" : "Margen"]} contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #E3E3E3" }} />
                    <Area type="monotone" dataKey="net" stroke="#303030" fill="#303030" fillOpacity={0.08} strokeWidth={2} />
                    <Area type="monotone" dataKey="margin" stroke="#616161" fill="#616161" fillOpacity={0.05} strokeWidth={1.5} strokeDasharray="4 3" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <p className="py-10 text-center text-base text-muted-foreground">Sin ventas en el periodo.</p>}
            </Card>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Por método de pago">{sales.data?.byPaymentMethod.length ? <KeyValue items={sales.data.byPaymentMethod.map((m) => ({ label: m.methodName, value: <Money value={m.total} />, numeric: true }))} /> : <p className="text-sm text-muted-foreground">Sin pagos en el periodo.</p>}</Card>
              <Card title="Más vendidos (unidades)">
                {top.data?.length ? <ResponsiveContainer width="100%" height={Math.max(160, Math.min(top.data.length, 8) * 32)}><BarChart data={top.data.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 24 }}><XAxis type="number" hide /><YAxis type="category" dataKey="productTitle" width={160} tick={{ fontSize: 12, fill: "#303030" }} tickLine={false} axisLine={false} tickFormatter={(v: string) => (v.length > 24 ? `${v.slice(0, 23)}…` : v)} /><Tooltip formatter={(v: number) => [v.toLocaleString("es-CO"), "Unidades"]} contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #E3E3E3" }} /><Bar dataKey="quantity" fill="#303030" radius={[0, 4, 4, 0]} barSize={16} /></BarChart></ResponsiveContainer> : <p className="text-sm text-muted-foreground">Sin datos.</p>}
              </Card>
            </div>
          </div>
        )
      ) : null}

      {url.tab === "productos" ? (
        <Card title="Más vendidos" padded={false}>
          <table className="w-full text-base"><thead className="text-sm text-muted-foreground"><tr className="border-b border-border"><th className="px-4 py-2 text-left font-medium sm:px-5">#</th><th className="px-3 py-2 text-left font-medium">Producto</th><th className="hidden px-3 py-2 text-left font-medium md:table-cell">SKU</th><th className="px-3 py-2 text-right font-medium">Unidades</th><th className="px-3 py-2 text-right font-medium">Ventas netas</th><th className="hidden px-3 py-2 text-right font-medium sm:table-cell sm:pr-5">Margen</th></tr></thead>
            <tbody className="divide-y divide-border">{(top.data ?? []).map((r, i) => <tr key={r.variantId} className="h-12"><td className="px-4 py-2 tabular text-muted-foreground sm:px-5">{i + 1}</td><td className="px-3 py-2"><span className="font-medium">{r.productTitle}</span>{r.variantTitle !== "Default" ? <span className="text-muted-foreground"> · {r.variantTitle}</span> : null}</td><td className="hidden px-3 py-2 tabular text-muted-foreground md:table-cell">{r.sku}</td><td className="px-3 py-2 text-right"><Qty value={r.quantity} /></td><td className="px-3 py-2 text-right"><Money value={r.net} /></td><td className="hidden px-3 py-2 text-right sm:table-cell sm:pr-5"><Money value={r.margin} /></td></tr>)}</tbody></table>
          {top.data && top.data.length === 0 ? <p className="py-10 text-center text-base text-muted-foreground">Sin ventas en el periodo.</p> : null}
        </Card>
      ) : null}

      {url.tab === "inventario" ? (
        valuation.isError ? <ErrorState error={valuation.error} /> : (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Unidades en existencia" value={valuation.data ? <Qty value={valuation.data.totalUnits} /> : null} loading={valuation.isLoading} />
              <Stat label="Valor a costo" value={valuation.data ? <Money value={valuation.data.totalCost} /> : null} loading={valuation.isLoading} />
              <Stat label="Valor a precio de venta" value={valuation.data ? <Money value={valuation.data.totalRetail} /> : null} loading={valuation.isLoading} />
              <Stat label="Margen potencial" value={valuation.data ? <Money value={valuation.data.potentialMargin} /> : null} loading={valuation.isLoading} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Por ubicación" padded={false}><ValTable rows={(valuation.data?.byLocation ?? []).map((r) => ({ name: r.locationName, ...r }))} /></Card>
              <Card title="Por categoría" padded={false}><ValTable rows={(valuation.data?.byCategory ?? []).map((r) => ({ name: r.categoryName, ...r }))} /></Card>
            </div>
          </div>
        )
      ) : null}

      {["stock_bajo", "sin_movimiento", "rotacion"].includes(url.tab) ? (
        <Card title={url.tab === "stock_bajo" ? "Productos por debajo del mínimo" : url.tab === "sin_movimiento" ? "Con existencia y sin ventas en 30 días" : "Rotación (vendidos / stock promedio, 30 días)"} padded={false} actions={<Button size="sm" variant="secondary" onClick={exportStock}><Download /> CSV</Button>}>
          {stock.isLoading ? <Skeleton className="m-4 h-40" /> : (
            <table className="w-full text-base"><thead className="text-sm text-muted-foreground"><tr className="border-b border-border"><th className="px-4 py-2 text-left font-medium sm:px-5">Producto</th><th className="hidden px-3 py-2 text-left font-medium md:table-cell">Ubicación</th><th className="px-3 py-2 text-right font-medium">Disponible</th><th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Mínimo</th><th className="px-3 py-2 text-right font-medium">Vendidos 30 d</th><th className="hidden px-3 py-2 text-right font-medium lg:table-cell">Rotación</th><th className="hidden px-3 py-2 text-left font-medium lg:table-cell sm:pr-5">Último mov.</th></tr></thead>
              <tbody className="divide-y divide-border">{(stock.data ?? []).map((r) => <tr key={`${r.variantId}-${r.locationName}`} className="h-12"><td className="px-4 py-2 sm:px-5"><span className="font-medium">{r.productTitle}</span>{r.variantTitle !== "Default" ? <span className="text-muted-foreground"> · {r.variantTitle}</span> : null}<div className="text-sm tabular text-muted-foreground">{r.sku}</div></td><td className="hidden px-3 py-2 text-muted-foreground md:table-cell">{r.locationName}</td><td className="px-3 py-2 text-right"><Qty value={r.available} className={r.available <= 0 ? "text-destructive font-medium" : ""} /></td><td className="hidden px-3 py-2 text-right text-muted-foreground sm:table-cell"><Qty value={r.minStock} /></td><td className="px-3 py-2 text-right"><Qty value={r.soldLast30} /></td><td className="hidden px-3 py-2 text-right tabular lg:table-cell">{r.rotation ?? "—"}</td><td className="hidden px-3 py-2 lg:table-cell sm:pr-5"><DateText value={r.lastMovementAt} className="text-muted-foreground" /></td></tr>)}</tbody></table>
          )}
          {stock.data && stock.data.length === 0 ? <p className="py-10 text-center text-base text-muted-foreground">Nada que mostrar.</p> : null}
        </Card>
      ) : null}
    </Page>
  );
}

function Stat({ label, value, hint, loading }: { label: string; value: React.ReactNode; hint?: string; loading?: boolean }) {
  return <div className="surface p-4"><div className="text-sm font-medium text-muted-foreground">{label}</div>{loading ? <Skeleton className="mt-1.5 h-7 w-28" /> : <div className="mt-1 text-lg font-semibold leading-7">{value}</div>}{hint ? <div className="mt-0.5 text-sm text-muted-foreground">{hint}</div> : null}</div>;
}
function ValTable({ rows }: { rows: { name: string; units: number; cost: number; retail: number }[] }) {
  return <table className="w-full text-base"><thead className="text-sm text-muted-foreground"><tr className="border-b border-border"><th className="px-4 py-2 text-left font-medium sm:px-5">Nombre</th><th className="px-3 py-2 text-right font-medium">Unidades</th><th className="px-3 py-2 text-right font-medium">A costo</th><th className="px-3 py-2 text-right font-medium sm:pr-5">A precio</th></tr></thead><tbody className="divide-y divide-border">{rows.map((r, i) => <tr key={i} className="h-11"><td className="px-4 py-2 sm:px-5">{r.name}</td><td className="px-3 py-2 text-right"><Qty value={r.units} /></td><td className="px-3 py-2 text-right"><Money value={r.cost} /></td><td className="px-3 py-2 text-right sm:pr-5"><Money value={r.retail} /></td></tr>)}{rows.length === 0 ? <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">Sin datos.</td></tr> : null}</tbody></table>;
}
