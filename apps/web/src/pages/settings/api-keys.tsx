import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { API_SCOPES, scopeLabels } from "@inventario/shared";
import { Card } from "@/components/app/page";
import { Field } from "@/components/app/form";
import { DateText } from "@/components/app/format";
import { useConfirm } from "@/components/app/confirm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError, v1 } from "@/lib/api";
import { useInvalidate, type ApiKey } from "@/lib/queries";

export default function ApiKeysSettings() {
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => api.get<{ data: ApiKey[] }>(v1("/api-keys")), select: (d) => d.data });
  const invalidate = useInvalidate();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [scopes, setScopes] = React.useState<string[]>(["read:products", "read:inventory"]);
  const [token, setToken] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const create = async () => {
    setBusy(true);
    try { const r = await api.post<{ token: string }>(v1("/api-keys"), { name: name.trim(), scopes }); setToken(r.token); await invalidate("api-keys"); setName(""); }
    catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo crear"); } finally { setBusy(false); }
  };
  const revoke = async (k: ApiKey) => { if (!(await confirm({ title: `¿Revocar “${k.name}”?`, description: "Las integraciones que la usen dejarán de funcionar de inmediato.", confirmLabel: "Revocar", destructive: true }))) return; try { await api.post(v1(`/api-keys/${k.id}/revoke`)); await invalidate("api-keys"); toast.success("API key revocada"); } catch { toast.error("No se pudo revocar"); } };
  const remove = async (k: ApiKey) => { if (!(await confirm({ title: `¿Eliminar “${k.name}”?`, confirmLabel: "Eliminar", destructive: true }))) return; try { await api.delete(v1(`/api-keys/${k.id}`)); await invalidate("api-keys"); toast.success("API key eliminada"); } catch { toast.error("No se pudo eliminar"); } };
  return (
    <Card title="API keys" description="Credenciales para que otros sistemas usen la API. Cada clave tiene alcances (scopes) y se puede revocar." padded={false} actions={<Button variant="primary" size="sm" onClick={() => { setToken(null); setOpen(true); }}>Crear API key</Button>}>
      <ul className="divide-y divide-border">
        {(keys.data ?? []).map((k) => <li key={k.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{k.name}</span><code className="rounded bg-muted px-1.5 py-0.5 text-xs tabular">iw_live_{k.prefix}.…</code>{k.revokedAt ? <Badge tone="critical">Revocada</Badge> : <Badge tone="success">Activa</Badge>}</div><div className="mt-1 flex flex-wrap gap-1">{k.scopes.map((s) => <Badge key={s} tone="outline">{s}</Badge>)}</div><div className="mt-1 text-sm text-muted-foreground">Creada <DateText value={k.createdAt} />{k.createdByName ? ` por ${k.createdByName}` : ""} · último uso: {k.lastUsedAt ? <DateText value={k.lastUsedAt} time /> : "nunca"}</div></div><div className="flex shrink-0 gap-1">{!k.revokedAt ? <Button variant="secondary" size="sm" onClick={() => revoke(k)}>Revocar</Button> : <Button variant="ghost" size="sm" onClick={() => remove(k)}>Eliminar</Button>}</div></li>)}
        {keys.data && keys.data.length === 0 ? <li className="px-4 py-6 text-center text-sm text-muted-foreground">Aún no hay API keys.</li> : null}
      </ul>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{token ? "API key creada" : "Crear API key"}</DialogTitle><DialogDescription>{token ? "Copia el token ahora. Por seguridad no se volverá a mostrar." : "Elige solo los alcances que la integración necesita."}</DialogDescription></DialogHeader>
          <DialogBody className="space-y-4">
            {token ? <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-3"><code className="flex-1 break-all text-sm tabular">{token}</code><Button variant="secondary" size="icon-sm" aria-label="Copiar" onClick={() => { navigator.clipboard.writeText(token); toast.success("Token copiado"); }}><Copy /></Button></div> : (
              <>
                <Field label="Nombre" required htmlFor="ak-name" help="Ej. “Tienda web”, “ERP contable”."><Input id="ak-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
                <Field label="Alcances" required><div className="grid gap-2 sm:grid-cols-2">{API_SCOPES.map((s) => <label key={s} className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-base hover:bg-surface-hover"><Checkbox className="mt-0.5" checked={scopes.includes(s)} onCheckedChange={(v) => setScopes((x) => (v ? [...x, s] : x.filter((y) => y !== s)))} /><span><span className="block font-medium tabular">{s}</span><span className="block text-sm text-muted-foreground">{scopeLabels[s]}</span></span></label>)}</div></Field>
              </>
            )}
          </DialogBody>
          <DialogFooter>{token ? <Button variant="primary" onClick={() => setOpen(false)}>Listo</Button> : <><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={name.trim().length < 2 || scopes.length === 0} onClick={create}>Crear</Button></>}</DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </Card>
  );
}
