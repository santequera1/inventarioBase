import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Page, PageHeader, Card, TwoColumn } from "@/components/app/page";
import { Field } from "@/components/app/form";
import { LocationSelect } from "@/components/app/pickers";
import { ProductCell } from "@/components/app/product-cell";
import { VariantPicker, type VariantHit } from "@/components/app/variant-picker";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInvalidate, useLocations } from "@/lib/queries";
import { newIdempotencyKey } from "@/lib/utils";

type Line = { variant: VariantHit; quantity: number };

export default function TransferNewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const locations = useLocations();
  const invalidate = useInvalidate();
  const [origin, setOrigin] = React.useState(user?.defaultLocationId ?? "");
  const [dest, setDest] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [note, setNote] = React.useState("");
  const [expectedAt, setExpectedAt] = React.useState("");
  const [saving, setSaving] = React.useState<null | "pending" | "dispatch">(null);

  React.useEffect(() => {
    if (!origin && locations.data?.length) setOrigin(locations.data.find((l) => l.isDefault)?.id ?? locations.data[0]!.id);
  }, [locations.data, origin]);

  const addLine = (v: VariantHit) => setLines((ls) => (ls.some((l) => l.variant.id === v.id) ? ls.map((l) => (l.variant.id === v.id ? { ...l, quantity: l.quantity + 1 } : l)) : [...ls, { variant: v, quantity: 1 }]));
  const overstock = lines.filter((l) => l.variant.available !== null && l.quantity > l.variant.available);
  const canSave = origin && dest && origin !== dest && lines.length > 0 && lines.every((l) => l.quantity > 0);

  const submit = async (dispatch: boolean) => {
    setSaving(dispatch ? "dispatch" : "pending");
    try {
      const t = await api.post<{ id: string; number: string }>(v1("/transfers"), { originLocationId: origin, destinationLocationId: dest, items: lines.map((l) => ({ variantId: l.variant.id, quantity: l.quantity })), note: note || undefined, expectedAt: expectedAt || null, dispatch }, newIdempotencyKey());
      toast.success(`Transferencia ${t.number} ${dispatch ? "despachada" : "creada"}`);
      await invalidate("transfers", "inventory-levels", "inventory-summary", "movements", "home");
      navigate(`/transferencias/${t.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear la transferencia");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Page>
      <PageHeader backTo="/transferencias" title="Crear transferencia" primaryAction={<Button variant="primary" disabled={!canSave || !!saving} loading={saving === "dispatch"} onClick={() => submit(true)}>Crear y despachar</Button>} secondaryActions={<Button variant="secondary" disabled={!canSave || !!saving} loading={saving === "pending"} onClick={() => submit(false)}>Guardar como pendiente</Button>} />
      <TwoColumn
        main={
          <>
            <Card title="Origen y destino">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Origen" required htmlFor="origin"><LocationSelect id="origin" value={origin} onChange={setOrigin} className="w-full" exclude={dest} /></Field>
                <Field label="Destino" required htmlFor="dest" error={origin && dest && origin === dest ? "Origen y destino deben ser ubicaciones distintas." : undefined}><LocationSelect id="dest" value={dest} onChange={setDest} className="w-full" exclude={origin} /></Field>
              </div>
            </Card>
            <Card title="Productos" padded={false}>
              <div className="px-4 pt-3 sm:px-5">
                <VariantPicker onPick={addLine} locationId={origin} placeholder="Añadir producto por nombre, SKU o código de barras" />
              </div>
              {lines.length === 0 ? (
                <EmptyState compact title="Sin productos" description="Busca y añade los productos que vas a transferir." />
              ) : (
                <table className="mt-3 w-full text-base">
                  <thead className="text-sm text-muted-foreground">
                    <tr className="border-y border-border">
                      <th className="px-4 py-2 text-left font-medium sm:px-5">Producto</th>
                      <th className="px-3 py-2 text-right font-medium">Disp. en origen</th>
                      <th className="w-[120px] px-3 py-2 text-right font-medium">Cantidad</th>
                      <th className="w-10 px-2 py-2 sm:pr-5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((l) => {
                      const over = l.variant.available !== null && l.quantity > l.variant.available;
                      return (
                        <tr key={l.variant.id}>
                          <td className="px-4 py-2 sm:px-5"><ProductCell title={l.variant.product.title} variantTitle={l.variant.title} sku={l.variant.sku} thumbUrl={l.variant.product.thumbUrl} compact /></td>
                          <td className={`px-3 py-2 text-right tabular ${over ? "text-destructive" : "text-muted-foreground"}`}>{l.variant.available?.toLocaleString("es-CO") ?? "—"}</td>
                          <td className="px-3 py-2"><Input type="number" min={1} className="h-8" value={l.quantity} invalid={over || l.quantity <= 0} onChange={(e) => setLines((ls) => ls.map((x) => (x.variant.id === l.variant.id ? { ...x, quantity: Number(e.target.value) } : x)))} aria-label="Cantidad" /></td>
                          <td className="px-2 py-2 sm:pr-5"><Button variant="ghost" size="icon-sm" aria-label="Quitar" onClick={() => setLines((ls) => ls.filter((x) => x.variant.id !== l.variant.id))}><Trash2 /></Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {overstock.length ? <p className="px-4 py-3 text-sm text-destructive sm:px-5">Hay cantidades mayores al disponible en el origen. Al despachar, el sistema rechazará la transferencia si no hay stock suficiente.</p> : null}
            </Card>
          </>
        }
        aside={
          <Card title="Detalles">
            <div className="space-y-4">
              <Field label="Llegada estimada" htmlFor="expected"><input id="expected" type="date" className="h-9 w-full rounded-md border border-input bg-card px-3 text-base tabular" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} /></Field>
              <Field label="Nota" htmlFor="note"><Textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Referencia, transportador…" /></Field>
              <p className="text-sm text-muted-foreground"><strong className="font-medium text-foreground">Pendiente:</strong> no toca el stock. <strong className="font-medium text-foreground">Despachar:</strong> descuenta el origen y marca Entrante en el destino hasta que se reciba.</p>
            </div>
          </Card>
        }
      />
    </Page>
  );
}
