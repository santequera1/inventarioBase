import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, RefreshCw } from "lucide-react";
import { WebhookEvent, webhookEventLabels } from "@inventario/shared";
import { Card } from "@/components/app/page";
import { Field } from "@/components/app/form";
import { DateText } from "@/components/app/format";
import { DeliveryStatusBadge } from "@/components/app/badges";
import { useConfirm } from "@/components/app/confirm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError, v1 } from "@/lib/api";
import { useInvalidate, type Webhook, type WebhookDelivery, type Page as P } from "@/lib/queries";

export default function WebhooksSettings() {
  const hooks = useQuery({ queryKey: ["webhooks"], queryFn: () => api.get<{ data: Webhook[] }>(v1("/webhooks")), select: (d) => d.data });
  const [filter, setFilter] = React.useState<string>("");
  const deliveries = useQuery({ queryKey: ["webhook-deliveries", filter], queryFn: () => api.get<P<WebhookDelivery>>(v1("/webhook-deliveries"), { webhook_id: filter || undefined, limit: 30 }), refetchInterval: 15_000 });
  const invalidate = useInvalidate();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = React.useState<Webhook | "new" | null>(null);
  const [url, setUrl] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [events, setEvents] = React.useState<string[]>([]);
  const [secret, setSecret] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [inspect, setInspect] = React.useState<WebhookDelivery | null>(null);
  React.useEffect(() => { if (editing) { setSecret(null); setUrl(editing === "new" ? "" : editing.url); setDesc(editing === "new" ? "" : editing.description ?? ""); setEvents(editing === "new" ? ["inventory.updated", "order.created"] : editing.events); } }, [editing]);
  const save = async () => {
    setBusy(true);
    try {
      if (editing === "new") { const r = await api.post<{ secret: string }>(v1("/webhooks"), { url, description: desc || null, events }); setSecret(r.secret); } else if (editing) { await api.patch(v1(`/webhooks/${editing.id}`), { url, description: desc || null, events }); setEditing(null); }
      await invalidate("webhooks"); toast.success("Webhook guardado");
    } catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo guardar"); } finally { setBusy(false); }
  };
  const act = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); await invalidate("webhooks", "webhook-deliveries"); toast.success(msg); } catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo completar"); } };
  return (
    <div className="flex flex-col gap-4">
      <Card title="Webhooks" description="Notificaciones HTTP firmadas (HMAC-SHA256) cuando cambia el inventario, se crean órdenes, etc." padded={false} actions={<Button variant="primary" size="sm" onClick={() => setEditing("new")}>Agregar webhook</Button>}>
        <ul className="divide-y divide-border">
          {(hooks.data ?? []).map((h) => <li key={h.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="min-w-0"><div className="flex items-center gap-2"><code className="truncate text-base font-medium">{h.url}</code>{h.failureCount >= 3 ? <Badge tone="critical">{h.failureCount} fallos</Badge> : null}</div><div className="mt-1 flex flex-wrap gap-1">{h.events.map((e) => <Badge key={e} tone="outline">{e}</Badge>)}</div><div className="mt-1 text-sm text-muted-foreground">{h.description ? `${h.description} · ` : ""}Secreto {h.secretPrefix} · última entrega: {h.lastDeliveryAt ? <><DateText value={h.lastDeliveryAt} time /> ({h.lastStatus})</> : "ninguna"}</div></div><div className="flex shrink-0 items-center gap-2"><Switch checked={h.active} onCheckedChange={(v) => act(() => api.patch(v1(`/webhooks/${h.id}`), { active: v }), v ? "Webhook activado" : "Webhook pausado")} aria-label="Activo" /><Button variant="secondary" size="sm" onClick={() => act(() => api.post(v1(`/webhooks/${h.id}/test`)), "Evento de prueba enviado")}>Probar</Button><Button variant="secondary" size="sm" onClick={() => setEditing(h)}>Editar</Button><Button variant="ghost" size="sm" onClick={async () => (await confirm({ title: "¿Eliminar webhook?", confirmLabel: "Eliminar", destructive: true })) && act(() => api.delete(v1(`/webhooks/${h.id}`)), "Webhook eliminado")}>Eliminar</Button></div></li>)}
          {hooks.data && hooks.data.length === 0 ? <li className="px-4 py-6 text-center text-sm text-muted-foreground">Aún no hay webhooks configurados.</li> : null}
        </ul>
      </Card>
      <Card title="Registro de entregas" description="Últimas entregas con su respuesta. Puedes reenviar manualmente las fallidas." padded={false} actions={<select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 rounded-md border border-input bg-card px-2 text-sm"><option value="">Todos los webhooks</option>{(hooks.data ?? []).map((h) => <option key={h.id} value={h.id}>{h.url}</option>)}</select>}>
        <table className="w-full text-base">
          <thead className="text-sm text-muted-foreground"><tr className="border-b border-border"><th className="px-4 py-2 text-left font-medium sm:px-5">Fecha</th><th className="px-3 py-2 text-left font-medium">Evento</th><th className="px-3 py-2 text-left font-medium">Estado</th><th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Intentos</th><th className="hidden px-3 py-2 text-left font-medium md:table-cell">Respuesta</th><th className="px-3 py-2 sm:pr-5"></th></tr></thead>
          <tbody className="divide-y divide-border">
            {(deliveries.data?.data ?? []).map((d) => <tr key={d.id} className="h-12"><td className="px-4 py-2 sm:px-5"><DateText value={d.createdAt} time className="text-muted-foreground" /></td><td className="px-3 py-2"><code className="text-sm">{d.event}</code></td><td className="px-3 py-2"><DeliveryStatusBadge status={d.status} /></td><td className="hidden px-3 py-2 text-right tabular sm:table-cell">{d.attempts}{d.nextAttemptAt && d.status === "RETRYING" ? <span className="block text-xs text-muted-foreground">próx. <DateText value={d.nextAttemptAt} time /></span> : null}</td><td className="hidden px-3 py-2 text-sm text-muted-foreground md:table-cell">{d.responseStatus ? `HTTP ${d.responseStatus}` : d.error ?? "—"}{d.durationMs ? ` · ${d.durationMs} ms` : ""}</td><td className="px-3 py-2 text-right sm:pr-5"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => setInspect(d)}>Ver</Button>{d.status !== "SUCCESS" ? <Button variant="secondary" size="sm" onClick={() => act(() => api.post(v1(`/webhook-deliveries/${d.id}/resend`)), "Reenviado")}><RefreshCw /> Reenviar</Button> : null}</div></td></tr>)}
          </tbody>
        </table>
        {deliveries.data && deliveries.data.data.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sin entregas registradas.</p> : null}
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>{secret ? "Webhook creado" : editing === "new" ? "Nuevo webhook" : "Editar webhook"}</DialogTitle><DialogDescription>{secret ? "Guarda el secreto para verificar la firma. No se volverá a mostrar." : "Enviaremos un POST JSON a esta URL por cada evento seleccionado."}</DialogDescription></DialogHeader>
          <DialogBody className="space-y-4">
            {secret ? <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-3"><code className="flex-1 break-all text-sm tabular">{secret}</code><Button variant="secondary" size="icon-sm" aria-label="Copiar" onClick={() => { navigator.clipboard.writeText(secret); toast.success("Secreto copiado"); }}><Copy /></Button></div> : (
              <>
                <Field label="URL de destino" required htmlFor="wh-url"><Input id="wh-url" type="url" placeholder="https://mi-sistema.com/webhooks/inventario" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
                <Field label="Descripción" htmlFor="wh-desc"><Input id="wh-desc" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
                <Field label="Eventos" required><div className="grid gap-2 sm:grid-cols-2">{WebhookEvent.options.map((e) => <label key={e} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-base hover:bg-surface-hover"><Checkbox checked={events.includes(e)} onCheckedChange={(v) => setEvents((x) => (v ? [...x, e] : x.filter((y) => y !== e)))} /><span className="flex-1">{webhookEventLabels[e]}</span><code className="text-xs text-muted-foreground">{e}</code></label>)}</div></Field>
                {editing !== "new" && editing ? <Button variant="plain" size="sm" onClick={async () => { if (!(await confirm({ title: "¿Rotar el secreto?", description: "Deberás actualizar la verificación en tu sistema.", confirmLabel: "Rotar" }))) return; const r = await api.post<{ secret: string }>(v1(`/webhooks/${editing.id}/rotate-secret`)); setSecret(r.secret); }}>Rotar secreto</Button> : null}
              </>
            )}
          </DialogBody>
          <DialogFooter>{secret ? <Button variant="primary" onClick={() => setEditing(null)}>Listo</Button> : <><Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!/^https?:\/\/.+/.test(url) || events.length === 0} onClick={save}>Guardar</Button></>}</DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!inspect} onOpenChange={(o) => !o && setInspect(null)}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Entrega {inspect?.id.slice(-8)}</DialogTitle><DialogDescription>{inspect?.event} · <DeliveryStatusBadge status={inspect?.status ?? "PENDING"} /></DialogDescription></DialogHeader>
          <DialogBody className="space-y-3">
            <div><div className="mb-1 text-sm font-medium text-muted-foreground">Payload</div><pre className="max-h-64 overflow-auto rounded-md bg-[#1a1a1a] p-3 text-xs text-[#e8e8e8]">{JSON.stringify(inspect?.payload, null, 2)}</pre></div>
            <div><div className="mb-1 text-sm font-medium text-muted-foreground">Respuesta {inspect?.responseStatus ? `(HTTP ${inspect.responseStatus})` : ""}</div><pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs">{inspect?.responseBody || inspect?.error || "—"}</pre></div>
          </DialogBody>
        </DialogContent>
      </Dialog>
      {dialog}
    </div>
  );
}
