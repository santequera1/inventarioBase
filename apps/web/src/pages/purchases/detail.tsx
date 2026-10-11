import * as React from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Page, PageHeader, Card, TwoColumn, KeyValue } from "@/components/app/page";
import { ProductCell } from "@/components/app/product-cell";
import { DateText, Money, Qty } from "@/components/app/format";
import { PurchaseStatusBadge } from "@/components/app/badges";
import { ErrorState, PageSkeleton } from "@/components/app/states";
import { useConfirm } from "@/components/app/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInvalidate, type PurchaseOrder } from "@/lib/queries";
import { newIdempotencyKey } from "@/lib/utils";

export default function PurchaseDetailPage() {
  const { id = "" } = useParams();
  const { can } = useAuth();
  const invalidate = useInvalidate();
  const { confirm, dialog } = useConfirm();
  const q = useQuery({ queryKey: ["purchase-order", id], queryFn: () => api.get<PurchaseOrder>(v1(`/purchase-orders/${id}`)) });
  const [receiveOpen, setReceiveOpen] = React.useState(false);
  const [recv, setRecv] = React.useState<Record<string, { quantity: number; unitCost: number }>>({});
  const [busy, setBusy] = React.useState(false);
  const act = async (action: string, body?: unknown, msg?: string) => {
    setBusy(true);
    try { await api.post(v1(`/purchase-orders/${id}/${action}`), body ?? {}, newIdempotencyKey()); toast.success(msg ?? "Listo"); await invalidate("purchase-order", "purchase-orders", "inventory-levels", "inventory-summary", "movements", "level", "home", "products", "product"); setReceiveOpen(false); }
    catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo completar la acción"); } finally { setBusy(false); }
  };
  if (q.isLoading) return <Page><PageSkeleton /></Page>;
  if (q.isError || !q.data) return <Page><ErrorState error={q.error} /></Page>;
  const po = q.data;
  const pending = po.items.map((i) => ({ ...i, pending: i.quantity - i.receivedQuantity }));
  const w = can("purchases.write");
  return (
    <Page>
      <PageHeader backTo="/compras" title={po.number} badge={<PurchaseStatusBadge status={po.status} />} subtitle={`${po.supplier.name} → ${po.location.name}`}
        primaryAction={w && po.status === "DRAFT" ? <Button variant="primary" loading={busy} onClick={async () => (await confirm({ title: "¿Marcar como pedida?", description: "Las cantidades aparecerán como Entrante en la ubicación de destino.", confirmLabel: "Marcar como pedida" })) && act("place", undefined, "Orden pedida")}>Marcar como pedida</Button> : w && (po.status === "ORDERED" || po.status === "PARTIAL") ? <Button variant="primary" onClick={() => { setRecv(Object.fromEntries(pending.map((i) => [i.variantId, { quantity: i.pending, unitCost: i.unitCost }]))); setReceiveOpen(true); }}>Recibir mercancía</Button> : undefined}
        secondaryActions={w && po.status !== "RECEIVED" && po.status !== "CANCELLED" ? <Button variant="destructive-secondary" disabled={busy} onClick={async () => (await confirm({ title: "¿Cancelar orden de compra?", description: "Lo pendiente dejará de contar como Entrante.", confirmLabel: "Cancelar orden", destructive: true })) && act("cancel", undefined, "Orden cancelada")}>Cancelar</Button> : undefined} />
      <TwoColumn
        main={
          <Card title="Productos" padded={false}>
            <table className="w-full text-base">
              <thead className="text-sm text-muted-foreground"><tr className="border-b border-border"><th className="px-4 py-2 text-left font-medium sm:px-5">Producto</th><th className="px-3 py-2 text-right font-medium">Pedido</th><th className="px-3 py-2 text-right font-medium">Recibido</th><th className="px-3 py-2 text-right font-medium">Costo unit.</th><th className="px-3 py-2 text-right font-medium sm:pr-5">Total</th></tr></thead>
              <tbody className="divide-y divide-border">
                {po.items.map((i) => (
                  <tr key={i.id} className="h-13">
                    <td className="px-4 py-2 sm:px-5"><ProductCell title={i.variant.product.title} variantTitle={i.variant.title} sku={i.variant.sku} thumbUrl={i.variant.product.thumbUrl} to={`/inventario/${i.variantId}/${po.locationId}`} /></td>
                    <td className="px-3 py-2 text-right"><Qty value={i.quantity} /></td>
                    <td className={`px-3 py-2 text-right ${i.receivedQuantity < i.quantity ? "text-muted-foreground" : ""}`}><Qty value={i.receivedQuantity} /></td>
                    <td className="px-3 py-2 text-right"><Money value={i.unitCost} /></td>
                    <td className="px-3 py-2 text-right sm:pr-5"><Money value={i.unitCost * i.quantity} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t border-border font-medium"><td className="px-4 py-2 sm:px-5" colSpan={4}>Total</td><td className="px-3 py-2 text-right sm:pr-5"><Money value={po.subtotal} /></td></tr></tfoot>
            </table>
          </Card>
        }
        aside={<Card title="Detalles"><KeyValue items={[{ label: "Referencia", value: po.reference ?? "—" }, { label: "Creada", value: <DateText value={po.createdAt} time /> }, { label: "Pedida", value: <DateText value={po.orderedAt} time /> }, { label: "Llegada estimada", value: <DateText value={po.expectedAt} /> }, { label: "Recibida", value: <DateText value={po.receivedAt} time /> }, ...(po.note ? [{ label: "Nota", value: po.note }] : [])]} /></Card>}
      />
      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Recibir mercancía</DialogTitle><DialogDescription>Puedes recibir parcialmente. El costo unitario actualiza el costo promedio del producto.</DialogDescription></DialogHeader>
          <DialogBody>
            <table className="w-full text-base">
              <thead className="text-sm text-muted-foreground"><tr className="border-b border-border"><th className="py-2 text-left font-medium">Producto</th><th className="py-2 text-right font-medium">Pendiente</th><th className="w-[110px] py-2 text-right font-medium">Recibir</th><th className="w-[140px] py-2 text-right font-medium">Costo unit.</th></tr></thead>
              <tbody className="divide-y divide-border">
                {pending.filter((i) => i.pending > 0).map((i) => (
                  <tr key={i.id}>
                    <td className="py-2"><ProductCell title={i.variant.product.title} variantTitle={i.variant.title} sku={i.variant.sku} thumbUrl={i.variant.product.thumbUrl} compact /></td>
                    <td className="py-2 text-right tabular text-muted-foreground">{i.pending}</td>
                    <td className="py-2"><Input type="number" min={0} max={i.pending} className="h-8" value={recv[i.variantId]?.quantity ?? 0} invalid={(recv[i.variantId]?.quantity ?? 0) > i.pending} onChange={(e) => setRecv((r) => ({ ...r, [i.variantId]: { quantity: Math.max(0, Number(e.target.value)), unitCost: r[i.variantId]?.unitCost ?? i.unitCost } }))} aria-label="Cantidad a recibir" /></td>
                    <td className="py-2"><Input type="number" min={0} className="h-8" value={recv[i.variantId]?.unitCost ?? i.unitCost} onChange={(e) => setRecv((r) => ({ ...r, [i.variantId]: { quantity: r[i.variantId]?.quantity ?? 0, unitCost: Number(e.target.value) } }))} aria-label="Costo unitario" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setReceiveOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={busy} disabled={Object.values(recv).every((v) => !v.quantity)} onClick={() => act("receive", { items: Object.entries(recv).map(([variantId, v]) => ({ variantId, quantity: v.quantity, unitCost: v.unitCost })) }, "Recepción registrada")}>Recibir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </Page>
  );
}
