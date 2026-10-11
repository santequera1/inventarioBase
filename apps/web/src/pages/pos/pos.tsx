import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus, Printer, Trash2, UserPlus, Wallet, X } from "lucide-react";
import { Page, PageHeader } from "@/components/app/page";
import { Field } from "@/components/app/form";
import { LocationSelect } from "@/components/app/pickers";
import { ProductCell } from "@/components/app/product-cell";
import { VariantPicker, type VariantHit } from "@/components/app/variant-picker";
import { Money } from "@/components/app/format";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounce, useHotkey, useSelectedLocation } from "@/lib/hooks";
import { useInvalidate, usePaymentMethods, useSettings, type CashSession, type Customer, type Order, type Page as P } from "@/lib/queries";
import { cn, newIdempotencyKey } from "@/lib/utils";
import { CustomerFormDialog } from "../customers/customer-form";

type Line = { variant: VariantHit; quantity: number; unitPrice: number; discount: number };
type Payment = { methodCode: string; amount: number; received?: number; reference?: string };

export default function PosPage() {
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const settings = useSettings();
  const methods = usePaymentMethods();
  const invalidate = useInvalidate();
  const [locationId, setLocationId] = useSelectedLocation(user?.defaultLocationId);
  const [lines, setLines] = React.useState<Line[]>([]);
  const [discount, setDiscount] = React.useState(0);
  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [note, setNote] = React.useState("");
  const [payOpen, setPayOpen] = React.useState(false);
  const [customerOpen, setCustomerOpen] = React.useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = React.useState(false);
  const [lastOrder, setLastOrder] = React.useState<Order | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const cash = useQuery({ queryKey: ["cash-current", locationId], queryFn: () => api.get<{ session: CashSession | null }>(v1("/cash-sessions/current"), { location_id: locationId }), enabled: !!locationId, refetchInterval: 60_000 });

  useHotkey("F2", React.useCallback(() => searchRef.current?.focus(), []));
  useHotkey("F9", React.useCallback(() => { if (lines.length) setPayOpen(true); }, [lines.length]));

  const pricesIncludeTax = settings.data?.pricesIncludeTax ?? true;
  const subtotal = lines.reduce((a, l) => a + l.unitPrice * l.quantity, 0);
  const lineDiscounts = lines.reduce((a, l) => a + l.discount, 0);
  const afterLine = subtotal - lineDiscounts;
  const gd = Math.min(discount, afterLine);
  const net = Math.max(0, afterLine - gd);
  const taxTotal = lines.reduce((a, l) => {
    const lineNet = Math.max(0, l.unitPrice * l.quantity - l.discount);
    const share = afterLine > 0 ? (lineNet * gd) / afterLine : 0;
    const base = Math.max(0, lineNet - share);
    return a + (pricesIncludeTax ? base - Math.round(base / (1 + l.variant.product.taxRate / 100)) : Math.round((base * l.variant.product.taxRate) / 100));
  }, 0);
  const total = pricesIncludeTax ? net : net + Math.round(taxTotal);

  const addVariant = (v: VariantHit) => {
    if (v.available !== null && v.available <= 0 && !settings.data?.allowNegativeStock) {
      toast.error(`"${v.product.title}" está agotado en esta ubicación`);
      return;
    }
    setLines((ls) => (ls.some((l) => l.variant.id === v.id) ? ls.map((l) => (l.variant.id === v.id ? { ...l, quantity: l.quantity + 1 } : l)) : [...ls, { variant: v, quantity: 1, unitPrice: v.price, discount: 0 }]));
  };
  const update = (id: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.variant.id === id ? { ...l, ...patch } : l)));
  const clear = () => { setLines([]); setDiscount(0); setCustomer(null); setNote(""); };

  const complete = async (payments: Payment[], hold: boolean) => {
    const order = await api.post<Order>(v1("/orders"), { locationId, customerId: customer?.id ?? null, items: lines.map((l) => ({ variantId: l.variant.id, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount })), discount: gd, payments, note: note || null, source: "POS", cashSessionId: cash.data?.session?.id ?? null, hold }, newIdempotencyKey());
    setLastOrder(order);
    setPayOpen(false);
    clear();
    await invalidate("orders", "inventory-levels", "inventory-summary", "movements", "home", "cash-current", "customers");
    toast.success(`Venta ${order.number} registrada`, { description: `Total ${order.total.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}`, action: { label: "Imprimir", onClick: () => window.open(`/recibo/${order.id}`, "_blank") } });
  };

  return (
    <Page width="wide" className="pb-28 lg:pb-6">
      <PageHeader title="Punto de venta" subtitle={<span>F2 buscar · F9 cobrar · Lector de código de barras compatible</span>} secondaryActions={<><LocationSelect value={locationId} onChange={setLocationId} />{can("cash.manage") ? <Button asChild variant="secondary"><Link to="/caja"><Wallet /> {cash.data?.session ? "Caja abierta" : "Abrir caja"}</Link></Button> : null}</>} primaryAction={lastOrder ? <Button variant="secondary" onClick={() => window.open(`/recibo/${lastOrder.id}`, "_blank")}><Printer /> Imprimir {lastOrder.number}</Button> : undefined} />
      {!cash.data?.session && locationId && can("cash.manage") ? <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-tone-warning-bg bg-tone-warning-bg/40 px-4 py-2.5 text-base text-tone-warning-fg"><span>No hay una caja abierta en esta ubicación. Las ventas en efectivo no quedarán en un arqueo.</span><Button asChild size="sm" variant="secondary"><Link to="/caja">Abrir caja</Link></Button></div> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="surface overflow-hidden">
          <div className="border-b border-border p-4"><VariantPicker inputRef={searchRef} onPick={addVariant} locationId={locationId} autoFocus showPrice placeholder="Escanea un código o busca por nombre / SKU (F2)" /></div>
          {lines.length === 0 ? <EmptyState title="Carrito vacío" description="Busca o escanea productos para añadirlos a la venta." /> : (
            <table className="w-full text-base">
              <thead className="text-sm text-muted-foreground"><tr className="border-b border-border"><th className="px-4 py-2 text-left font-medium">Producto</th><th className="w-[130px] px-2 py-2 text-center font-medium">Cant.</th><th className="w-[130px] px-2 py-2 text-right font-medium">Precio</th><th className="hidden w-[120px] px-2 py-2 text-right font-medium sm:table-cell">Desc.</th><th className="px-2 py-2 text-right font-medium">Total</th><th className="w-10 px-2"></th></tr></thead>
              <tbody className="divide-y divide-border">
                {lines.map((l) => (
                  <tr key={l.variant.id}>
                    <td className="px-4 py-2"><ProductCell title={l.variant.product.title} variantTitle={l.variant.title} sku={l.variant.sku} thumbUrl={l.variant.product.thumbUrl} compact />{l.variant.available !== null && l.quantity > l.variant.available ? <span className="mt-1 inline-block text-xs text-destructive">Solo hay {l.variant.available} disponibles</span> : null}</td>
                    <td className="px-2 py-2"><div className="flex items-center justify-center gap-1"><Button variant="secondary" size="icon-sm" aria-label="Menos" onClick={() => (l.quantity <= 1 ? setLines((ls) => ls.filter((x) => x.variant.id !== l.variant.id)) : update(l.variant.id, { quantity: l.quantity - 1 }))}><Minus /></Button><Input type="number" min={1} className="h-8 w-14 px-1 text-center" value={l.quantity} onChange={(e) => update(l.variant.id, { quantity: Math.max(1, Number(e.target.value) || 1) })} aria-label="Cantidad" /><Button variant="secondary" size="icon-sm" aria-label="Más" onClick={() => update(l.variant.id, { quantity: l.quantity + 1 })}><Plus /></Button></div></td>
                    <td className="px-2 py-2"><Input type="number" min={0} className="h-8" value={l.unitPrice} onChange={(e) => update(l.variant.id, { unitPrice: Math.max(0, Number(e.target.value) || 0) })} aria-label="Precio unitario" /></td>
                    <td className="hidden px-2 py-2 sm:table-cell"><Input type="number" min={0} className="h-8" value={l.discount} onChange={(e) => update(l.variant.id, { discount: Math.max(0, Number(e.target.value) || 0) })} aria-label="Descuento de línea" /></td>
                    <td className="px-2 py-2 text-right font-medium"><Money value={l.unitPrice * l.quantity - l.discount} /></td>
                    <td className="px-2 py-2"><Button variant="ghost" size="icon-sm" aria-label="Quitar" onClick={() => setLines((ls) => ls.filter((x) => x.variant.id !== l.variant.id))}><Trash2 /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="surface p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="section-title">Cliente</h2>{customer ? <Button variant="ghost" size="icon-sm" aria-label="Quitar cliente" onClick={() => setCustomer(null)}><X /></Button> : null}</div>
            {customer ? <div><div className="font-medium">{customer.firstName} {customer.lastName}</div><div className="text-sm text-muted-foreground">{customer.documentNumber ?? customer.phone ?? customer.email ?? "Sin documento"}</div></div> : <div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={() => setCustomerOpen(true)}>Buscar cliente</Button>{can("customers.write") ? <Button variant="secondary" size="icon" aria-label="Nuevo cliente" onClick={() => setNewCustomerOpen(true)}><UserPlus /></Button> : null}</div>}
          </div>
          <div className="surface p-4">
            <h2 className="section-title mb-3">Resumen</h2>
            <dl className="space-y-1.5 text-base">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal ({lines.reduce((a, l) => a + l.quantity, 0)} art.)</dt><dd><Money value={subtotal} /></dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Descuento</dt><dd className="flex items-center gap-2">{lineDiscounts ? <span className="text-sm text-muted-foreground">líneas −<Money value={lineDiscounts} /></span> : null}<Input type="number" min={0} className="h-8 w-28" value={discount || ""} placeholder="0" onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))} aria-label="Descuento global" /></dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">IVA {pricesIncludeTax ? "incluido" : ""}</dt><dd className="text-muted-foreground"><Money value={Math.round(taxTotal)} /></dd></div>
              <div className="flex justify-between border-t border-border pt-2 text-md font-semibold"><dt>Total</dt><dd><Money value={total} /></dd></div>
            </dl>
            <Textarea rows={2} className="mt-3 min-h-9" placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="mt-3 grid gap-2">
              <Button variant="primary" size="lg" disabled={lines.length === 0 || !locationId} onClick={() => setPayOpen(true)}>Cobrar <Money value={total} className="ml-1" /></Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" disabled={lines.length === 0} onClick={async () => { try { await complete([], true); } catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo guardar"); } }}>Dejar en espera</Button>
                <Button variant="ghost" disabled={lines.length === 0} onClick={clear}>Vaciar</Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} total={total} methods={methods.data ?? []} onComplete={(p) => complete(p, false)} />
      <CustomerSearchDialog open={customerOpen} onOpenChange={setCustomerOpen} onPick={(c) => { setCustomer(c); setCustomerOpen(false); }} />
      <CustomerFormDialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen} onSaved={(c) => { setCustomer(c); setNewCustomerOpen(false); }} />
      <span className="sr-only">{navigate.name}</span>
    </Page>
  );
}

function PaymentDialog({ open, onOpenChange, total, methods, onComplete }: { open: boolean; onOpenChange: (o: boolean) => void; total: number; methods: { code: string; name: string; type: string; requiresReference: boolean }[]; onComplete: (p: Payment[]) => Promise<void> }) {
  const [payments, setPayments] = React.useState<Payment[]>([]);
  const [method, setMethod] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  const remaining = Math.max(0, total - paid);
  const m = methods.find((x) => x.code === method);
  const isCash = m?.type === "CASH";
  const amt = Number(amount) || 0;
  const applied = isCash ? Math.min(amt, remaining) : Math.min(amt, remaining);
  const change = isCash ? Math.max(0, amt - remaining) : 0;

  React.useEffect(() => {
    if (open) { setPayments([]); setMethod(methods[0]?.code ?? ""); setAmount(String(total)); setReference(""); }
  }, [open, total, methods]);
  React.useEffect(() => { setAmount(String(remaining)); }, [remaining, method]);

  const add = () => {
    if (!m || amt <= 0) return;
    if (m.requiresReference && !reference.trim()) { toast.error(`Introduce la referencia para ${m.name}`); return; }
    setPayments((p) => [...p, { methodCode: m.code, amount: applied, received: isCash ? amt : undefined, reference: reference.trim() || undefined }]);
    setReference("");
  };
  const finish = async () => {
    setSaving(true);
    try {
      let list = payments;
      if (remaining > 0 && amt > 0 && m && !(m.requiresReference && !reference.trim())) list = [...payments, { methodCode: m.code, amount: applied, received: isCash ? amt : undefined, reference: reference.trim() || undefined }];
      await onComplete(list);
    } catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo registrar la venta"); } finally { setSaving(false); }
  };
  const finalRemaining = remaining - (remaining > 0 ? applied : 0);
  const quick = [total, Math.ceil(total / 1000) * 1000, Math.ceil(total / 5000) * 5000, Math.ceil(total / 10000) * 10000, Math.ceil(total / 50000) * 50000].filter((v, i, a) => v > 0 && a.indexOf(v) === i).slice(0, 4);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Cobrar <Money value={total} /></DialogTitle><DialogDescription>Puedes combinar varios métodos de pago.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          {payments.length ? <ul className="divide-y divide-border rounded-md border border-border">{payments.map((p, i) => <li key={i} className="flex items-center justify-between px-3 py-2 text-base"><span>{methods.find((x) => x.code === p.methodCode)?.name}{p.reference ? <span className="text-sm text-muted-foreground"> · {p.reference}</span> : null}</span><span className="flex items-center gap-2"><Money value={p.amount} className="font-medium" /><Button variant="ghost" size="icon-sm" aria-label="Quitar pago" onClick={() => setPayments((ps) => ps.filter((_, j) => j !== i))}><X /></Button></span></li>)}</ul> : null}
          {remaining > 0 ? (
            <>
              <Field label="Método de pago">
                <div className="flex flex-wrap gap-2">{methods.map((x) => <button key={x.code} type="button" onClick={() => setMethod(x.code)} className={cn("h-9 rounded-md border px-3 text-base font-medium", method === x.code ? "border-foreground bg-surface-selected" : "border-input bg-card hover:bg-surface-hover")}>{x.name}</button>)}</div>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={isCash ? "Efectivo recibido" : "Monto"} htmlFor="pay-amount"><Input id="pay-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && void finish()} /></Field>
                {m?.requiresReference || (m && m.type !== "CASH") ? <Field label={`Referencia${m.requiresReference ? "" : " (opcional)"}`} htmlFor="pay-ref"><Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Nº de aprobación" /></Field> : null}
              </div>
              {isCash ? <div className="flex flex-wrap gap-2">{quick.map((q) => <Button key={q} size="sm" variant="secondary" onClick={() => setAmount(String(q))}><Money value={q} /></Button>)}</div> : null}
              <div className="rounded-md bg-muted/60 p-3 text-base">
                <div className="flex justify-between"><span className="text-muted-foreground">Pendiente</span><Money value={remaining} /></div>
                {isCash && change > 0 ? <div className="flex justify-between font-semibold"><span>Cambio a devolver</span><Money value={change} /></div> : null}
                {finalRemaining > 0 ? <div className="flex justify-between text-tone-warning-fg"><span>Quedará pendiente</span><Money value={finalRemaining} /></div> : null}
              </div>
              {payments.length > 0 || finalRemaining > 0 ? <Button variant="secondary" size="sm" onClick={add} disabled={amt <= 0}>Añadir este pago y seguir</Button> : null}
            </>
          ) : <p className="rounded-md bg-tone-success-bg px-3 py-2 text-base text-tone-success-fg">Pagado en su totalidad.</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={finish} loading={saving}>{finalRemaining > 0 ? "Registrar con saldo pendiente" : "Completar venta"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerSearchDialog({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (c: Customer) => void }) {
  const [q, setQ] = React.useState("");
  const dq = useDebounce(q);
  const res = useQuery({ queryKey: ["customers", { q: dq, limit: 10 }], queryFn: () => api.get<P<Customer>>(v1("/customers"), { q: dq || undefined, limit: 10 }), enabled: open });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Seleccionar cliente</DialogTitle></DialogHeader>
        <DialogBody className="space-y-3">
          <Input autoFocus placeholder="Nombre, documento, teléfono o correo" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="max-h-72 divide-y divide-border overflow-auto rounded-md border border-border">
            {(res.data?.data ?? []).map((c) => <li key={c.id}><button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-surface-hover" onClick={() => onPick(c)}><span><span className="font-medium">{c.firstName} {c.lastName}</span><span className="block text-sm text-muted-foreground">{c.documentNumber ?? c.phone ?? c.email ?? "—"}</span></span><Badge tone="outline">{c.ordersCount} órdenes</Badge></button></li>)}
            {res.data && res.data.data.length === 0 ? <li className="px-3 py-4 text-center text-sm text-muted-foreground">Sin resultados.</li> : null}
          </ul>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
