import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { Page, PageHeader, Card, TwoColumn, KeyValue } from "@/components/app/page";
import { ProductCell } from "@/components/app/product-cell";
import { DateText, Money, Qty } from "@/components/app/format";
import { FulfillmentBadge, OrderStatusBadge, PaymentStatusBadge } from "@/components/app/badges";
import { ErrorState, PageSkeleton } from "@/components/app/states";
import { useConfirm } from "@/components/app/confirm";
import { Field } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { api, ApiError, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInvalidate, usePaymentMethods, useReasons, type Order } from "@/lib/queries";
import { newIdempotencyKey } from "@/lib/utils";

export default function OrderDetailPage() {
  const { id = "" } = useParams();
  const { can } = useAuth();
  const invalidate = useInvalidate();
  const { confirm, dialog } = useConfirm();
  const methods = usePaymentMethods();
  const q = useQuery({ queryKey: ["order", id], queryFn: () => api.get<Order>(v1(`/orders/${id}`)) });
  const [modal, setModal] = React.useState<null | "return" | "cancel" | "pay">(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const refresh = () => invalidate("order", "orders", "inventory-levels", "inventory-summary", "movements", "level", "home", "customers", "cash-current");

  if (q.isLoading) return <Page><PageSkeleton /></Page>;
  if (q.isError || !q.data) return <Page><ErrorState error={q.error} /></Page>;
  const o = q.data;
  const returnable = o.status === "COMPLETED" && o.items.some((i) => i.returnedQuantity < i.quantity);
  const due = o.total - o.paidTotal;

  const addNote = async () => {
    if (!note.trim()) return;
    try { await api.post(v1(`/orders/${id}/notes`), { message: note.trim() }); setNote(""); await invalidate("order"); } catch { toast.error("No se pudo añadir la nota"); }
  };
  const fulfill = async () => {
    if (!(await confirm({ title: "¿Marcar como entregada?", description: "Las unidades comprometidas se descontarán definitivamente del inventario.", confirmLabel: "Entregar" }))) return;
    setBusy(true);
    try { await api.post(v1(`/orders/${id}/fulfill`), {}, newIdempotencyKey()); toast.success("Orden entregada"); await refresh(); } catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo entregar"); } finally { setBusy(false); }
  };

  return (
    <Page>
      <PageHeader backTo="/ordenes" title={o.number} badge={<span className="flex gap-1.5"><OrderStatusBadge status={o.status} /><PaymentStatusBadge status={o.paymentStatus} /><FulfillmentBadge status={o.fulfillmentStatus} /></span>} subtitle={<span><DateText value={o.createdAt} time /> · {o.location?.name} · {o.source === "POS" ? "POS" : o.source === "API" ? "API" : "Manual"}{o.createdByName ? ` · ${o.createdByName}` : ""}</span>}
        primaryAction={o.status === "OPEN" && can("orders.write") ? <Button variant="primary" loading={busy} onClick={fulfill}>Marcar como entregada</Button> : <Button variant="secondary" onClick={() => window.open(`/recibo/${o.id}`, "_blank")}><Printer /> Imprimir recibo</Button>}
        secondaryActions={<>{o.status === "OPEN" ? <Button variant="secondary" onClick={() => window.open(`/recibo/${o.id}`, "_blank")}><Printer /> Recibo</Button> : null}{due > 0 && o.status !== "CANCELLED" && can("orders.write") ? <Button variant="secondary" onClick={() => setModal("pay")}>Registrar pago</Button> : null}{returnable && can("orders.refund") ? <Button variant="secondary" onClick={() => setModal("return")}>Devolución</Button> : null}{o.status !== "CANCELLED" && can("orders.refund") ? <Button variant="destructive-secondary" onClick={() => setModal("cancel")}>Anular</Button> : null}</>} />
      <TwoColumn
        main={
          <>
            <Card title={`Artículos (${o.itemCount})`} padded={false}>
              <table className="w-full text-base">
                <thead className="text-sm text-muted-foreground"><tr className="border-b border-border"><th className="px-4 py-2 text-left font-medium sm:px-5">Producto</th><th className="px-3 py-2 text-right font-medium">Cant.</th><th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Precio</th><th className="hidden px-3 py-2 text-right font-medium md:table-cell">Desc.</th><th className="hidden px-3 py-2 text-right font-medium md:table-cell">IVA</th><th className="px-3 py-2 text-right font-medium sm:pr-5">Total</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {o.items.map((i) => (
                    <tr key={i.id} className="h-13">
                      <td className="px-4 py-2 sm:px-5"><ProductCell title={i.productTitle} variantTitle={i.variantTitle} sku={i.sku} thumbUrl={i.thumbUrl} to={i.variantId ? `/inventario/${i.variantId}/${o.locationId}` : undefined} />{i.returnedQuantity > 0 ? <Badge tone="info" className="mt-1">Devueltas: {i.returnedQuantity}</Badge> : null}</td>
                      <td className="px-3 py-2 text-right"><Qty value={i.quantity} /></td>
                      <td className="hidden px-3 py-2 text-right sm:table-cell"><Money value={i.unitPrice} /></td>
                      <td className="hidden px-3 py-2 text-right text-muted-foreground md:table-cell">{i.discount ? <>−<Money value={i.discount} /></> : "—"}</td>
                      <td className="hidden px-3 py-2 text-right text-muted-foreground md:table-cell">{i.taxRate}% <span className="text-xs">(<Money value={i.taxAmount} />)</span></td>
                      <td className="px-3 py-2 text-right font-medium sm:pr-5"><Money value={i.total} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-border px-4 py-3 sm:px-5">
                <KeyValue items={[{ label: "Subtotal", value: <Money value={o.subtotal} />, numeric: true }, ...(o.discountTotal ? [{ label: "Descuentos", value: <>−<Money value={o.discountTotal} /></>, numeric: true }] : []), { label: "IVA incluido", value: <Money value={o.taxTotal} />, numeric: true }, { label: <span className="font-semibold text-foreground">Total</span>, value: <span className="text-md font-semibold"><Money value={o.total} /></span>, numeric: true }, { label: "Pagado", value: <Money value={o.paidTotal} />, numeric: true }, ...(o.refundedTotal ? [{ label: "Reembolsado", value: <Money value={o.refundedTotal} />, numeric: true }] : []), ...(due > 0 && o.status !== "CANCELLED" ? [{ label: <span className="text-tone-warning-fg">Saldo pendiente</span>, value: <span className="text-tone-warning-fg"><Money value={due} /></span>, numeric: true }] : [])]} />
              </div>
            </Card>
            <Card title="Pagos" padded={false}>
              {o.payments.length === 0 ? <p className="px-4 py-4 text-sm text-muted-foreground">Sin pagos registrados.</p> : <ul className="divide-y divide-border">{o.payments.map((p) => <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-base sm:px-5"><span><span className="font-medium">{p.methodName}</span>{p.kind === "REFUND" ? <Badge tone="neutral" className="ml-2">Reembolso</Badge> : null}<span className="block text-sm text-muted-foreground"><DateText value={p.createdAt} time />{p.reference ? ` · Ref. ${p.reference}` : ""}{p.change ? ` · Cambio ${p.change.toLocaleString("es-CO")}` : ""}</span></span><Money value={p.kind === "REFUND" ? -p.amount : p.amount} className="font-medium" /></li>)}</ul>}
            </Card>
            <Card title="Línea de tiempo" padded={false}>
              <div className="px-4 pt-3 sm:px-5"><div className="flex gap-2"><Input placeholder="Escribe una nota…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} /><Button variant="secondary" onClick={addNote} disabled={!note.trim()}>Añadir</Button></div></div>
              <ol className="px-4 py-3 sm:px-5">
                {[...(o.events ?? [])].reverse().map((e) => <li key={e.id} className="relative border-l border-border py-1.5 pl-4 last:pb-0"><span className="absolute -left-[5px] top-3 h-2 w-2 rounded-full bg-[#8a8a8a]" /><div className="text-base">{e.message}</div><div className="text-sm text-muted-foreground"><DateText value={e.createdAt} time />{e.actorName ? ` · ${e.actorName}` : ""}</div></li>)}
              </ol>
            </Card>
          </>
        }
        aside={
          <>
            <Card title="Cliente">{o.customer ? <div><Link to={`/clientes/${o.customer.id}`} className="font-medium hover:underline">{o.customer.firstName} {o.customer.lastName}</Link><div className="text-sm text-muted-foreground">{o.customer.documentNumber}</div>{o.customer.phone ? <div className="text-sm text-muted-foreground">{o.customer.phone}</div> : null}{o.customer.email ? <div className="text-sm text-muted-foreground">{o.customer.email}</div> : null}</div> : <p className="text-sm text-muted-foreground">Venta sin cliente.</p>}</Card>
            <Card title="Detalles"><KeyValue items={[{ label: "Ubicación", value: o.location?.name }, { label: "Vendedor", value: o.createdByName ?? "—" }, { label: "Origen", value: o.source }, ...(o.externalRef ? [{ label: "Ref. externa", value: o.externalRef }] : []), ...(o.note ? [{ label: "Nota", value: <span className="whitespace-pre-wrap font-normal">{o.note}</span> }] : []), { label: "Completada", value: <DateText value={o.completedAt} time /> }, ...(o.cancelledAt ? [{ label: "Anulada", value: <DateText value={o.cancelledAt} time /> }] : [])]} /></Card>
          </>
        }
      />
      <ReturnDialog open={modal === "return"} onOpenChange={(v) => !v && setModal(null)} order={o} methods={methods.data ?? []} onDone={refresh} />
      <CancelDialog open={modal === "cancel"} onOpenChange={(v) => !v && setModal(null)} order={o} methods={methods.data ?? []} onDone={refresh} />
      <PayDialog open={modal === "pay"} onOpenChange={(v) => !v && setModal(null)} order={o} methods={methods.data ?? []} onDone={refresh} />
      {dialog}
    </Page>
  );
}

type M = { code: string; name: string; type: string }[];

function ReturnDialog({ open, onOpenChange, order, methods, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; order: Order; methods: M; onDone: () => Promise<unknown> }) {
  const reasons = useReasons("RETURN");
  const [sel, setSel] = React.useState<Record<string, { quantity: number; restock: boolean; restockAs: "AVAILABLE" | "UNAVAILABLE" }>>({});
  const [reason, setReason] = React.useState("");
  const [method, setMethod] = React.useState("");
  const [refund, setRefund] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setSel({}); setReason(""); setRefund(""); setMethod(order.payments[0]?.methodCode ?? ""); } }, [open, order]);
  const items = Object.entries(sel).filter(([, v]) => v.quantity > 0);
  const proportional = items.reduce((a, [lineId, v]) => { const l = order.items.find((x) => x.id === lineId)!; return a + Math.round((l.total / l.quantity) * v.quantity); }, 0);
  const maxRefund = order.paidTotal - order.refundedTotal;
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(v1(`/orders/${order.id}/returns`), { items: items.map(([lineId, v]) => ({ lineId, ...v })), reason, refundAmount: refund === "" ? undefined : Number(refund), refundMethodCode: method || undefined }, newIdempotencyKey());
      toast.success("Devolución registrada"); await onDone(); onOpenChange(false);
    } catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo registrar"); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>Devolución</DialogTitle><DialogDescription>Selecciona los artículos. Lo que reingresa al stock queda registrado como movimiento “Devolución”.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <table className="w-full text-base">
            <thead className="text-sm text-muted-foreground"><tr className="border-b border-border"><th className="w-8"></th><th className="py-2 text-left font-medium">Producto</th><th className="w-[90px] py-2 text-right font-medium">Cant.</th><th className="w-[200px] py-2 text-left font-medium pl-3">Reingreso</th></tr></thead>
            <tbody className="divide-y divide-border">
              {order.items.filter((i) => i.returnedQuantity < i.quantity).map((i) => { const max = i.quantity - i.returnedQuantity; const s = sel[i.id]; return (
                <tr key={i.id}>
                  <td className="py-2"><Checkbox checked={!!s} onCheckedChange={(v) => setSel((x) => { const n = { ...x }; if (v) n[i.id] = { quantity: max, restock: true, restockAs: "AVAILABLE" }; else delete n[i.id]; return n; })} aria-label="Seleccionar" /></td>
                  <td className="py-2"><ProductCell title={i.productTitle} variantTitle={i.variantTitle} sku={i.sku} thumbUrl={i.thumbUrl} compact /></td>
                  <td className="py-2"><Input type="number" min={1} max={max} className="h-9 sm:h-8" disabled={!s} value={s?.quantity ?? ""} onChange={(e) => setSel((x) => ({ ...x, [i.id]: { ...x[i.id]!, quantity: Math.min(max, Math.max(1, Number(e.target.value) || 1)) } }))} aria-label="Cantidad" /></td>
                  <td className="py-2 pl-3"><Select disabled={!s} value={s ? (s.restock ? s.restockAs : "NONE") : "AVAILABLE"} onValueChange={(v) => setSel((x) => ({ ...x, [i.id]: { ...x[i.id]!, restock: v !== "NONE", restockAs: v === "UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE" } }))}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="AVAILABLE">A disponible</SelectItem><SelectItem value="UNAVAILABLE">A no disponible (dañado)</SelectItem><SelectItem value="NONE">No reingresa</SelectItem></SelectContent></Select></td>
                </tr>); })}
            </tbody>
          </table>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Motivo" required htmlFor="ret-reason"><Select value={reason} onValueChange={setReason}><SelectTrigger id="ret-reason"><SelectValue placeholder="Selecciona" /></SelectTrigger><SelectContent>{(reasons.data ?? []).map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}<SelectItem value="Otro">Otro</SelectItem></SelectContent></Select></Field>
            <Field label="Método de reembolso" htmlFor="ret-method"><Select value={method} onValueChange={setMethod}><SelectTrigger id="ret-method"><SelectValue placeholder="Mismo que el pago" /></SelectTrigger><SelectContent>{methods.map((m) => <SelectItem key={m.code} value={m.code}>{m.name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Monto a reembolsar" htmlFor="ret-amount" help={`Proporcional: ${Math.min(proportional, maxRefund).toLocaleString("es-CO")}. Máximo: ${maxRefund.toLocaleString("es-CO")}.`}><Input id="ret-amount" type="number" min={0} max={maxRefund} value={refund} placeholder={String(Math.min(proportional, maxRefund))} onChange={(e) => setRefund(e.target.value)} /></Field>
          </div>
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={items.length === 0 || !reason} onClick={submit}>Registrar devolución</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ open, onOpenChange, order, methods, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; order: Order; methods: M; onDone: () => Promise<unknown> }) {
  const [reason, setReason] = React.useState("");
  const [refund, setRefund] = React.useState(true);
  const [method, setMethod] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const refundable = order.paidTotal - order.refundedTotal;
  const submit = async () => {
    setBusy(true);
    try { await api.post(v1(`/orders/${order.id}/cancel`), { reason, refund, refundMethodCode: method || undefined }, newIdempotencyKey()); toast.success("Orden anulada"); await onDone(); onOpenChange(false); }
    catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo anular"); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Anular {order.number}</DialogTitle><DialogDescription>Todas las unidades no devueltas reingresan como disponibles.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Motivo" required htmlFor="cancel-reason"><Textarea id="cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
          {refundable > 0 ? <><label className="flex items-center gap-2 text-base"><Checkbox checked={refund} onCheckedChange={(v) => setRefund(!!v)} /> Reembolsar <Money value={refundable} className="font-medium" /></label>{refund ? <Field label="Método de reembolso" htmlFor="cancel-method"><Select value={method} onValueChange={setMethod}><SelectTrigger id="cancel-method"><SelectValue placeholder="Mismo que el pago" /></SelectTrigger><SelectContent>{methods.map((m) => <SelectItem key={m.code} value={m.code}>{m.name}</SelectItem>)}</SelectContent></Select></Field> : null}</> : null}
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Volver</Button><Button variant="destructive" loading={busy} disabled={reason.trim().length < 2} onClick={submit}>Anular orden</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({ open, onOpenChange, order, methods, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; order: Order; methods: M; onDone: () => Promise<unknown> }) {
  const due = order.total - order.paidTotal;
  const [method, setMethod] = React.useState(methods[0]?.code ?? "");
  const [amount, setAmount] = React.useState(String(due));
  const [reference, setReference] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setAmount(String(due)); setMethod(methods[0]?.code ?? ""); } }, [open, due, methods]);
  const submit = async () => {
    setBusy(true);
    try { await api.post(v1(`/orders/${order.id}/payments`), { payments: [{ methodCode: method, amount: Number(amount), received: Number(amount), reference: reference || undefined }] }, newIdempotencyKey()); toast.success("Pago registrado"); await onDone(); onOpenChange(false); }
    catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo registrar"); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Registrar pago</DialogTitle><DialogDescription>Saldo pendiente: <Money value={due} /></DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Método" htmlFor="pay-m"><Select value={method} onValueChange={setMethod}><SelectTrigger id="pay-m"><SelectValue /></SelectTrigger><SelectContent>{methods.map((m) => <SelectItem key={m.code} value={m.code}>{m.name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Monto" htmlFor="pay-a"><Input id="pay-a" type="number" min={1} max={due} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Referencia (opcional)" htmlFor="pay-r"><Input id="pay-r" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!method || Number(amount) <= 0} onClick={submit}>Registrar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
