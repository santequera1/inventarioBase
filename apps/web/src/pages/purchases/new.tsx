import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Page, PageHeader, Card, TwoColumn, KeyValue } from "@/components/app/page";
import { Field } from "@/components/app/form";
import { LocationSelect } from "@/components/app/pickers";
import { ProductCell } from "@/components/app/product-cell";
import { VariantPicker, type VariantHit } from "@/components/app/variant-picker";
import { EmptyState } from "@/components/app/states";
import { Money } from "@/components/app/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInvalidate, useLocations, useSuppliersAll } from "@/lib/queries";
import { newIdempotencyKey } from "@/lib/utils";

type Line = { variant: VariantHit; quantity: number; unitCost: number };

export default function PurchaseNewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const suppliers = useSuppliersAll();
  const locations = useLocations();
  const invalidate = useInvalidate();
  const [supplierId, setSupplierId] = React.useState("");
  const [locationId, setLocationId] = React.useState(user?.defaultLocationId ?? "");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [reference, setReference] = React.useState("");
  const [expectedAt, setExpectedAt] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState<null | "draft" | "place">(null);
  React.useEffect(() => { if (!locationId && locations.data?.length) setLocationId(locations.data.find((l) => l.isDefault)?.id ?? locations.data[0]!.id); }, [locations.data, locationId]);
  const total = lines.reduce((a, l) => a + l.quantity * l.unitCost, 0);
  const canSave = supplierId && locationId && lines.length > 0 && lines.every((l) => l.quantity > 0);
  const submit = async (place: boolean) => {
    setSaving(place ? "place" : "draft");
    try {
      const po = await api.post<{ id: string; number: string }>(v1("/purchase-orders"), { supplierId, locationId, items: lines.map((l) => ({ variantId: l.variant.id, quantity: l.quantity, unitCost: l.unitCost })), reference: reference || null, expectedAt: expectedAt || null, note: note || null, place }, newIdempotencyKey());
      toast.success(`Orden ${po.number} ${place ? "pedida" : "guardada como borrador"}`);
      await invalidate("purchase-orders", "inventory-levels", "home");
      navigate(`/compras/${po.id}`);
    } catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo crear la orden"); } finally { setSaving(null); }
  };
  return (
    <Page>
      <PageHeader backTo="/compras" title="Crear orden de compra" primaryAction={<Button variant="primary" disabled={!canSave || !!saving} loading={saving === "place"} onClick={() => submit(true)}>Crear y marcar como pedida</Button>} secondaryActions={<Button variant="secondary" disabled={!canSave || !!saving} loading={saving === "draft"} onClick={() => submit(false)}>Guardar borrador</Button>} />
      <TwoColumn
        main={
          <>
            <Card title="Proveedor y destino">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Proveedor" required htmlFor="po-supplier"><Select value={supplierId} onValueChange={setSupplierId}><SelectTrigger id="po-supplier"><SelectValue placeholder="Selecciona un proveedor" /></SelectTrigger><SelectContent>{(suppliers.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Ubicación de destino" required htmlFor="po-loc"><LocationSelect id="po-loc" value={locationId} onChange={setLocationId} className="w-full" /></Field>
              </div>
            </Card>
            <Card title="Productos" padded={false}>
              <div className="px-4 pt-3 sm:px-5"><VariantPicker locationId={locationId} activeOnly={false} onPick={(v) => setLines((ls) => (ls.some((l) => l.variant.id === v.id) ? ls : [...ls, { variant: v, quantity: 1, unitCost: v.cost ?? 0 }]))} placeholder="Añadir producto" /></div>
              {lines.length === 0 ? <EmptyState compact title="Sin productos" description="Añade los productos que vas a pedir, con cantidad y costo unitario." /> : (
                <table className="mt-3 w-full text-base">
                  <thead className="text-sm text-muted-foreground"><tr className="border-y border-border"><th className="px-4 py-2 text-left font-medium sm:px-5">Producto</th><th className="w-[100px] px-3 py-2 text-right font-medium">Cantidad</th><th className="w-[140px] px-3 py-2 text-right font-medium">Costo unit.</th><th className="px-3 py-2 text-right font-medium">Total</th><th className="w-10 sm:pr-5"></th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((l) => (
                      <tr key={l.variant.id}>
                        <td className="px-4 py-2 sm:px-5"><ProductCell title={l.variant.product.title} variantTitle={l.variant.title} sku={l.variant.sku} thumbUrl={l.variant.product.thumbUrl} compact /></td>
                        <td className="px-3 py-2"><Input type="number" min={1} className="h-8" value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x) => (x.variant.id === l.variant.id ? { ...x, quantity: Number(e.target.value) } : x)))} aria-label="Cantidad" /></td>
                        <td className="px-3 py-2"><Input type="number" min={0} className="h-8" value={l.unitCost} onChange={(e) => setLines((ls) => ls.map((x) => (x.variant.id === l.variant.id ? { ...x, unitCost: Number(e.target.value) } : x)))} aria-label="Costo unitario" /></td>
                        <td className="px-3 py-2 text-right"><Money value={l.quantity * l.unitCost} /></td>
                        <td className="px-2 py-2 sm:pr-5"><Button variant="ghost" size="icon-sm" aria-label="Quitar" onClick={() => setLines((ls) => ls.filter((x) => x.variant.id !== l.variant.id))}><Trash2 /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </>
        }
        aside={
          <>
            <Card title="Resumen"><KeyValue items={[{ label: "Unidades", value: lines.reduce((a, l) => a + l.quantity, 0), numeric: true }, { label: "Total a costo", value: <Money value={total} />, numeric: true }]} /></Card>
            <Card title="Detalles">
              <div className="space-y-4">
                <Field label="Referencia del proveedor" htmlFor="po-ref"><Input id="po-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Nº de factura o pedido" /></Field>
                <Field label="Llegada estimada" htmlFor="po-exp"><input id="po-exp" type="date" className="h-9 w-full rounded-md border border-input bg-card px-3 text-base tabular" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} /></Field>
                <Field label="Nota" htmlFor="po-note"><Textarea id="po-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              </div>
            </Card>
          </>
        }
      />
    </Page>
  );
}
