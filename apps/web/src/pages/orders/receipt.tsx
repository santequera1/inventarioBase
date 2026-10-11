import * as React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatCOP, formatDateTime } from "@inventario/shared";
import { api, v1 } from "@/lib/api";
import type { Order, StoreSettings } from "@/lib/queries";

/** Recibo imprimible: ticket 80 mm (por defecto) o A4 (?formato=a4). Imprime con Ctrl+P / Guardar como PDF. */
export default function ReceiptPage() {
  const { id = "" } = useParams();
  const [sp] = useSearchParams();
  const a4 = sp.get("formato") === "a4";
  const order = useQuery({ queryKey: ["order", id], queryFn: () => api.get<Order>(v1(`/orders/${id}`)) });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api.get<StoreSettings>(v1("/settings")) });
  React.useEffect(() => {
    if (order.data && settings.data && sp.get("auto") !== "0") setTimeout(() => window.print(), 300);
  }, [order.data, settings.data, sp]);
  if (!order.data || !settings.data) return <div className="p-6 text-base text-muted-foreground">Cargando recibo…</div>;
  const o = order.data;
  const s = settings.data;
  const payments = o.payments.filter((p) => p.kind === "PAYMENT");
  const change = payments.reduce((a, p) => a + p.change, 0);
  return (
    <div className={a4 ? "mx-auto max-w-[720px] p-10 text-[13px] text-black" : "mx-auto w-[80mm] p-3 text-[12px] leading-[1.35] text-black"} style={{ fontFamily: a4 ? "Inter, system-ui, sans-serif" : "ui-monospace, 'Courier New', monospace" }}>
      <style>{`@page { size: ${a4 ? "A4" : "80mm auto"}; margin: ${a4 ? "16mm" : "3mm"}; } @media print { html, body { background: #fff; } }`}</style>
      <div className="no-print mb-4 flex gap-2 text-[13px]" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        <button onClick={() => window.print()} className="rounded border border-gray-400 px-3 py-1">Imprimir</button>
        <a href={`/recibo/${id}?formato=${a4 ? "ticket" : "a4"}&auto=0`} className="rounded border border-gray-400 px-3 py-1">Ver en {a4 ? "ticket 80 mm" : "A4"}</a>
        <a href={`/ordenes/${id}`} className="rounded border border-gray-400 px-3 py-1">Volver a la orden</a>
      </div>
      <header className={a4 ? "mb-6 flex items-start justify-between" : "mb-2 text-center"}>
        <div>
          <div className={a4 ? "text-xl font-semibold" : "text-[14px] font-bold"}>{s.name}</div>
          {s.legalName ? <div>{s.legalName}</div> : null}
          {s.nit ? <div>NIT {s.nit}</div> : null}
          {s.address ? <div>{s.address}{s.city ? `, ${s.city}` : ""}</div> : null}
          {s.phone ? <div>Tel. {s.phone}</div> : null}
        </div>
        <div className={a4 ? "text-right" : "mt-2"}>
          <div className="font-bold">{o.status === "CANCELLED" ? "ORDEN ANULADA" : "RECIBO DE VENTA"} {o.number}</div>
          <div>{formatDateTime(o.createdAt)}</div>
          <div>{o.location?.name}{o.createdByName ? ` · ${o.createdByName}` : ""}</div>
        </div>
      </header>
      {o.customer ? <div className={a4 ? "mb-4" : "mb-2 border-t border-dashed border-black pt-1"}><span className="font-bold">Cliente:</span> {o.customer.firstName} {o.customer.lastName}{o.customer.documentNumber ? ` · ${o.customer.documentNumber}` : ""}{o.customer.phone ? ` · ${o.customer.phone}` : ""}</div> : null}
      <table className="w-full border-t border-dashed border-black">
        <thead><tr className="border-b border-dashed border-black"><th className="py-1 text-left">Artículo</th><th className="py-1 text-right">Cant.</th><th className="py-1 text-right">Precio</th><th className="py-1 text-right">Total</th></tr></thead>
        <tbody>
          {o.items.map((i) => <tr key={i.id} className="align-top"><td className="py-0.5 pr-1">{i.productTitle}{i.variantTitle !== "Default" ? ` ${i.variantTitle}` : ""}<div className="text-[10px] opacity-70">{i.sku}{i.discount ? ` · desc. ${formatCOP(i.discount)}` : ""}</div></td><td className="py-0.5 text-right">{i.quantity}</td><td className="py-0.5 text-right">{formatCOP(i.unitPrice)}</td><td className="py-0.5 text-right">{formatCOP(i.total)}</td></tr>)}
        </tbody>
      </table>
      <div className="mt-1 border-t border-dashed border-black pt-1">
        <Row l="Subtotal" v={formatCOP(o.subtotal)} />
        {o.discountTotal ? <Row l="Descuento" v={`-${formatCOP(o.discountTotal)}`} /> : null}
        {Object.entries(o.items.reduce<Record<number, number>>((acc, i) => { acc[i.taxRate] = (acc[i.taxRate] ?? 0) + i.taxAmount; return acc; }, {})).filter(([, v]) => v > 0).map(([r, v]) => <Row key={r} l={`IVA ${r}% incluido`} v={formatCOP(v)} />)}
        <Row l="TOTAL" v={formatCOP(o.total)} bold />
        {payments.map((p) => <Row key={p.id} l={p.methodName + (p.reference ? ` (${p.reference})` : "")} v={formatCOP(p.received ?? p.amount)} />)}
        {change > 0 ? <Row l="Cambio" v={formatCOP(change)} /> : null}
        {o.total - o.paidTotal > 0 && o.status !== "CANCELLED" ? <Row l="Saldo pendiente" v={formatCOP(o.total - o.paidTotal)} bold /> : null}
        {o.refundedTotal ? <Row l="Reembolsado" v={formatCOP(o.refundedTotal)} /> : null}
      </div>
      {o.note ? <div className="mt-2 border-t border-dashed border-black pt-1">Nota: {o.note}</div> : null}
      <footer className="mt-3 border-t border-dashed border-black pt-2 text-center">{s.receiptFooter ?? "¡Gracias por su compra!"}<div className="mt-1 text-[10px] opacity-70">{o.itemCount} artículo(s) · Documento interno, no equivale a factura electrónica</div></footer>
    </div>
  );
}
function Row({ l, v, bold }: { l: string; v: string; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? "font-bold" : ""}`}><span>{l}</span><span>{v}</span></div>;
}
