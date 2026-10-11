import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import type { z } from "zod";
import type { importPreviewResponse, importResultResponse } from "@inventario/shared";
import { Card } from "@/components/app/page";
import { Field } from "@/components/app/form";
import { LocationSelect } from "@/components/app/pickers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError, v1 } from "@/lib/api";
import { useInvalidate } from "@/lib/queries";
import { downloadBlob } from "@/lib/utils";

type Preview = z.infer<typeof importPreviewResponse>;
type Result = z.infer<typeof importResultResponse>;
const KINDS = { products: "Productos y variantes", inventory: "Ajustes de inventario", customers: "Clientes" } as const;

export default function ImportPage() {
  const [sp, setSp] = useSearchParams();
  const kind = (sp.get("kind") as keyof typeof KINDS) || "products";
  const invalidate = useInvalidate();
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [result, setResult] = React.useState<Result | null>(null);
  const [locationId, setLocationId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const onFile = async (f: File | null) => {
    if (!f) return;
    setBusy(true); setResult(null);
    try { const fd = new FormData(); fd.append("file", f); setPreview(await api.upload<Preview>(v1(`/imports/preview?kind=${kind}`), fd)); }
    catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo leer el archivo"); } finally { setBusy(false); }
  };
  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    try { const r = await api.post<Result>(v1("/imports/commit"), { token: preview.token, locationId: locationId || undefined }); setResult(r); setPreview(null); await invalidate("products", "inventory-levels", "inventory-summary", "customers", "movements"); toast.success(`Importación completada: ${r.created} creados, ${r.updated} actualizados`); }
    catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo importar"); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-4">
      <Card title="Importar CSV" description="Sube un archivo CSV (separado por ; o ,). Verás una vista previa con los errores por fila antes de confirmar.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo de datos"><Select value={kind} onValueChange={(v) => { setSp({ kind: v }); setPreview(null); setResult(null); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(KINDS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></Field>
          {kind === "products" ? <Field label="Ubicación para el stock inicial" help="Si el CSV trae la columna stock_inicial."><LocationSelect value={locationId} onChange={setLocationId} className="w-full" /></Field> : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 text-base font-medium text-primary-foreground shadow-primary-button hover:bg-[#1a1a1a]"><Upload className="h-4 w-4" /> {busy ? "Procesando…" : "Elegir archivo CSV"}<input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} disabled={busy} /></label>
          <Button variant="secondary" onClick={async () => { try { downloadBlob(await api.blob(v1("/imports/template"), { kind }), `plantilla-${kind}.csv`); } catch { toast.error("No se pudo descargar"); } }}><Download /> Descargar plantilla</Button>
        </div>
      </Card>
      {preview ? (
        <Card title={`Vista previa: ${preview.total} filas`} description={<span><Badge tone="success">{preview.valid} válidas</Badge> <Badge tone={preview.invalid ? "critical" : "neutral"}>{preview.invalid} con errores</Badge> Las filas con errores se omitirán.</span>} padded={false} actions={<Button variant="primary" disabled={preview.valid === 0} loading={busy} onClick={commit}>Importar {preview.valid} filas</Button>}>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-muted-foreground"><tr><th className="px-3 py-2 text-left font-medium">Fila</th><th className="px-3 py-2 text-left font-medium">Acción</th>{preview.columns.map((c) => <th key={c} className="px-3 py-2 text-left font-medium">{c}</th>)}<th className="px-3 py-2 text-left font-medium">Errores</th></tr></thead>
              <tbody className="divide-y divide-border">{preview.rows.map((r) => <tr key={r.row} className={r.action === "error" ? "bg-tone-critical-bg/30" : ""}><td className="px-3 py-1.5 tabular text-muted-foreground">{r.row}</td><td className="px-3 py-1.5"><Badge tone={r.action === "error" ? "critical" : r.action === "update" ? "info" : "success"}>{r.action === "create" ? "Crear" : r.action === "update" ? "Actualizar" : r.action === "error" ? "Error" : "Omitir"}</Badge></td>{preview.columns.map((c) => <td key={c} className="max-w-[200px] truncate px-3 py-1.5">{r.data[c]}</td>)}<td className="px-3 py-1.5 text-destructive">{r.errors.join(" ")}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      ) : null}
      {result ? <Card title="Resultado"><ul className="space-y-1 text-base"><li>Creados: <strong className="tabular">{result.created}</strong></li><li>Actualizados: <strong className="tabular">{result.updated}</strong></li><li>Omitidos: <strong className="tabular">{result.skipped}</strong></li></ul>{result.errors.length ? <ul className="mt-3 space-y-1 text-sm text-destructive">{result.errors.map((e, i) => <li key={i}>Fila {e.row}: {e.message}</li>)}</ul> : null}</Card> : null}
    </div>
  );
}
