import * as React from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Page, PageHeader, Card, TwoColumn, KeyValue } from "@/components/app/page";
import { ProductCell } from "@/components/app/product-cell";
import { DateText, Qty } from "@/components/app/format";
import { CountStatusBadge } from "@/components/app/badges";
import { ErrorState, PageSkeleton } from "@/components/app/states";
import { useConfirm } from "@/components/app/confirm";
import { Field } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInvalidate, useReasons, type StockCount } from "@/lib/queries";
import { newIdempotencyKey } from "@/lib/utils";

export default function CountDetailPage() {
  const { id = "" } = useParams();
  const { can } = useAuth();
  const invalidate = useInvalidate();
  const { confirm, dialog } = useConfirm();
  const reasons = useReasons("ADJUSTMENT");
  const c = useQuery({ queryKey: ["count", id], queryFn: () => api.get<StockCount>(v1(`/stock-counts/${id}`)) });
  const [edits, setEdits] = React.useState<Record<string, number>>({});
  const [reasonId, setReasonId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  if (c.isLoading) return <Page><PageSkeleton /></Page>;
  if (c.isError || !c.data) return <Page><ErrorState error={c.error} /></Page>;
  const count = c.data;
  const open = count.status === "OPEN";
  const dirty = Object.keys(edits).length > 0;
  const totalDiff = count.items.reduce((a, i) => a + ((edits[i.variantId] ?? i.counted) - i.expected), 0);

  const saveEdits = async () => {
    setBusy(true);
    try {
      await api.patch(v1(`/stock-counts/${id}`), { items: Object.entries(edits).map(([variantId, counted]) => ({ variantId, counted })) });
      setEdits({});
      await invalidate("count", "counts");
      toast.success("Cantidades guardadas");
    } catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo guardar"); } finally { setBusy(false); }
  };
  const apply = async () => {
    if (dirty) await saveEdits();
    if (!(await confirm({ title: "¿Aplicar conteo?", description: `Se ajustará el Disponible de ${count.items.length} producto(s) a lo contado (diferencia neta ${totalDiff >= 0 ? "+" : ""}${totalDiff}). Cada cambio quedará en el historial como “Conteo”.`, confirmLabel: "Aplicar conteo" }))) return;
    setBusy(true);
    try {
      await api.post(v1(`/stock-counts/${id}/apply`), { reasonId: reasonId || undefined }, newIdempotencyKey());
      await invalidate("count", "counts", "inventory-levels", "inventory-summary", "movements", "level", "home");
      toast.success("Conteo aplicado");
    } catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo aplicar"); } finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!(await confirm({ title: "¿Cancelar conteo?", description: "No se aplicará ningún ajuste.", confirmLabel: "Cancelar conteo", destructive: true }))) return;
    try { await api.post(v1(`/stock-counts/${id}/cancel`)); await invalidate("count", "counts"); toast.success("Conteo cancelado"); } catch { toast.error("No se pudo cancelar"); }
  };

  return (
    <Page>
      <PageHeader backTo="/inventario/conteos" title={count.number} badge={<CountStatusBadge status={count.status} />} subtitle={count.location.name}
        primaryAction={open && can("inventory.count") ? <Button variant="primary" loading={busy} onClick={apply}>Aplicar conteo</Button> : undefined}
        secondaryActions={open && can("inventory.count") ? <>{dirty ? <Button variant="secondary" loading={busy} onClick={saveEdits}>Guardar cantidades</Button> : null}<Button variant="destructive-secondary" onClick={cancel}>Cancelar conteo</Button></> : undefined} />
      <TwoColumn
        main={
          <Card title="Productos contados" padded={false}>
            <table className="w-full text-base">
              <thead className="text-sm text-muted-foreground"><tr className="border-b border-border"><th className="px-4 py-2 text-left font-medium sm:px-5">Producto</th><th className="px-3 py-2 text-right font-medium">Esperado</th><th className="w-[120px] px-3 py-2 text-right font-medium">Contado</th><th className="px-3 py-2 text-right font-medium sm:pr-5">Diferencia</th></tr></thead>
              <tbody className="divide-y divide-border">
                {count.items.map((i) => {
                  const counted = edits[i.variantId] ?? i.counted;
                  const diff = counted - i.expected;
                  return (
                    <tr key={i.id} className="h-13">
                      <td className="px-4 py-2 sm:px-5"><ProductCell title={i.variant.product.title} variantTitle={i.variant.title} sku={i.variant.sku} thumbUrl={i.variant.product.thumbUrl} to={`/inventario/${i.variantId}/${count.locationId}`} /></td>
                      <td className="px-3 py-2 text-right tabular text-muted-foreground">{i.expected}</td>
                      <td className="px-3 py-2">{open && can("inventory.count") ? <Input type="number" min={0} className="h-9 sm:h-8" value={counted} onChange={(e) => setEdits((s) => ({ ...s, [i.variantId]: Math.max(0, Number(e.target.value)) }))} aria-label="Contado" /> : <span className="block text-right tabular">{counted}</span>}</td>
                      <td className="px-3 py-2 text-right sm:pr-5"><Qty value={diff} signed className={diff !== 0 ? "font-medium" : "text-muted-foreground"} /></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr className="border-t border-border font-medium"><td className="px-4 py-2 sm:px-5" colSpan={3}>Diferencia neta</td><td className="px-3 py-2 text-right sm:pr-5"><Qty value={totalDiff} signed /></td></tr></tfoot>
            </table>
          </Card>
        }
        aside={
          <>
            {open && can("inventory.count") ? (
              <Card title="Aplicar">
                <Field label="Motivo del ajuste" htmlFor="count-reason" help="Por defecto: “Conteo físico”.">
                  <Select value={reasonId} onValueChange={setReasonId}><SelectTrigger id="count-reason"><SelectValue placeholder="Conteo físico" /></SelectTrigger><SelectContent>{(reasons.data ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select>
                </Field>
              </Card>
            ) : null}
            <Card title="Detalles"><KeyValue items={[{ label: "Creado", value: <DateText value={count.createdAt} time /> }, { label: "Aplicado", value: <DateText value={count.appliedAt} time /> }, ...(count.note ? [{ label: "Nota", value: count.note }] : [])]} /></Card>
          </>
        }
      />
      {dialog}
    </Page>
  );
}
