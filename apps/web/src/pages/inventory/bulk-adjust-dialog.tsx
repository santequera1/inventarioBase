import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/app/form";
import { ProductCell } from "@/components/app/product-cell";
import { Qty } from "@/components/app/format";
import { api, ApiError, v1 } from "@/lib/api";
import { useInvalidate, useReasons, type InventoryLevel } from "@/lib/queries";
import { newIdempotencyKey } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

/** Ajuste masivo de las filas seleccionadas: una cantidad por fila, un motivo común, vista previa por fila. */
export function BulkAdjustDialog({ open, onOpenChange, rows, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; rows: InventoryLevel[]; onDone?: () => void }) {
  const [mode, setMode] = React.useState<"delta" | "set">("delta");
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [reasonId, setReasonId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const reasons = useReasons("ADJUSTMENT");
  const invalidate = useInvalidate();

  React.useEffect(() => {
    if (open) {
      setValues({});
      setReasonId("");
      setError(null);
    }
  }, [open]);

  const entries = rows.map((r) => {
    const raw = values[r.id] ?? "";
    const n = raw === "" || raw === "-" ? null : Number(raw);
    const valid = n !== null && Number.isInteger(n) && (mode === "set" ? n >= 0 : n !== 0);
    const after = valid ? (mode === "set" ? n! : r.available + n!) : null;
    return { row: r, n, valid, after };
  });
  const toApply = entries.filter((e) => e.valid);
  const canSubmit = toApply.length > 0 && !!reasonId && !saving && !entries.some((e) => (values[e.row.id] ?? "") !== "" && !e.valid);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post(v1("/inventory-adjustments/bulk"), { adjustments: toApply.map((e) => ({ variantId: e.row.variantId, locationId: e.row.locationId, mode, bucket: "AVAILABLE", quantity: e.n, reasonId })) }, newIdempotencyKey());
      toast.success(`${toApply.length} ${toApply.length === 1 ? "ajuste aplicado" : "ajustes aplicados"}`);
      await invalidate("inventory-levels", "inventory-summary", "movements", "home");
      onDone?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo aplicar el ajuste.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Ajustar {rows.length} {rows.length === 1 ? "producto" : "productos"}</DialogTitle>
          <DialogDescription>Las filas sin cantidad se omiten. Todos los ajustes se guardan juntos con el mismo motivo.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de ajuste" htmlFor="bulk-mode">
              <Select value={mode} onValueChange={(v) => setMode(v as "delta")}>
                <SelectTrigger id="bulk-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="delta">Agregar o quitar unidades</SelectItem>
                  <SelectItem value="set">Establecer cantidad final</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Motivo" required htmlFor="bulk-reason">
              <Select value={reasonId} onValueChange={setReasonId}>
                <SelectTrigger id="bulk-reason"><SelectValue placeholder="Selecciona un motivo" /></SelectTrigger>
                <SelectContent>{(reasons.data ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-base">
              <thead className="bg-muted/60 text-sm text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Disponible</th>
                  <th className="w-[130px] px-3 py-2 text-right font-medium">{mode === "delta" ? "± Unidades" : "Cantidad final"}</th>
                  <th className="w-[90px] px-3 py-2 text-right font-medium">Quedará</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map(({ row, valid, after }) => (
                  <tr key={row.id}>
                    <td className="px-3 py-1.5"><ProductCell title={row.variant!.product.title} variantTitle={row.variant!.title} sku={row.variant!.sku} thumbUrl={row.variant!.product.thumbUrl} compact /></td>
                    <td className="px-3 py-1.5 text-right"><Qty value={row.available} /></td>
                    <td className="px-3 py-1.5">
                      <Input type="text" inputMode="numeric" className="h-8 text-right" value={values[row.id] ?? ""} invalid={(values[row.id] ?? "") !== "" && !valid} onChange={(e) => setValues((v) => ({ ...v, [row.id]: e.target.value.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "") }))} placeholder={mode === "delta" ? "+5 / -2" : String(row.available)} />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular">
                      {after === null ? <span className="text-muted-foreground">—</span> : <span className="inline-flex items-center gap-1 font-medium"><ArrowRight className="h-3 w-3 text-muted-foreground" />{after.toLocaleString("es-CO")}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error ? <p className="rounded-md bg-tone-critical-bg px-3 py-2 text-sm text-tone-critical-fg" role="alert">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit} loading={saving}>Aplicar {toApply.length > 0 ? `(${toApply.length})` : ""}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
