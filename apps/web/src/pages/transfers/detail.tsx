import * as React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { Page, PageHeader, Card, TwoColumn, KeyValue } from "@/components/app/page";
import { ProductCell } from "@/components/app/product-cell";
import { DateText, Qty } from "@/components/app/format";
import { TransferStatusBadge } from "@/components/app/badges";
import { ErrorState, PageSkeleton } from "@/components/app/states";
import { useConfirm } from "@/components/app/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInvalidate, type Transfer } from "@/lib/queries";
import { newIdempotencyKey } from "@/lib/utils";

export default function TransferDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const invalidate = useInvalidate();
  const { confirm, dialog } = useConfirm();
  const t = useQuery({ queryKey: ["transfer", id], queryFn: () => api.get<Transfer>(v1(`/transfers/${id}`)) });
  const [receiveOpen, setReceiveOpen] = React.useState(false);
  const [receiveQty, setReceiveQty] = React.useState<Record<string, number>>({});
  const [busy, setBusy] = React.useState(false);

  const act = async (action: string, body?: unknown, successMsg?: string) => {
    setBusy(true);
    try {
      await api.post(v1(`/transfers/${id}/${action}`), body ?? {}, newIdempotencyKey());
      toast.success(successMsg ?? "Listo");
      await invalidate("transfer", "transfers", "inventory-levels", "inventory-summary", "movements", "level", "home");
      setReceiveOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo completar la acción");
    } finally {
      setBusy(false);
    }
  };

  if (t.isLoading) return <Page><PageSkeleton /></Page>;
  if (t.isError || !t.data) return <Page><ErrorState error={t.error} /></Page>;
  const tr = t.data;
  const pending = tr.items.map((i) => ({ ...i, pending: i.quantity - i.receivedQuantity }));
  const canWrite = can("inventory.transfer");

  return (
    <Page>
      <PageHeader
        backTo="/transferencias"
        title={tr.number}
        badge={<TransferStatusBadge status={tr.status} />}
        subtitle={<span className="inline-flex items-center gap-1.5">{tr.origin.name} <ArrowRight className="h-3.5 w-3.5" /> {tr.destination.name}</span>}
        primaryAction={
          canWrite && (tr.status === "PENDING" || tr.status === "DRAFT") ? <Button variant="primary" loading={busy} onClick={async () => (await confirm({ title: "¿Despachar transferencia?", description: `Se descontarán ${tr.totalQuantity} unidades de ${tr.origin.name} y quedarán como Entrante en ${tr.destination.name}.`, confirmLabel: "Despachar" })) && act("dispatch", undefined, "Transferencia despachada")}>Despachar</Button>
          : canWrite && tr.status === "IN_TRANSIT" ? <Button variant="primary" onClick={() => { setReceiveQty(Object.fromEntries(pending.map((i) => [i.variantId, i.pending]))); setReceiveOpen(true); }}>Recibir</Button>
          : undefined
        }
        secondaryActions={canWrite && (tr.status === "PENDING" || tr.status === "IN_TRANSIT" || tr.status === "DRAFT") ? <Button variant="destructive-secondary" disabled={busy} onClick={async () => (await confirm({ title: "¿Cancelar transferencia?", description: tr.status === "IN_TRANSIT" ? "Las unidades no recibidas volverán a estar disponibles en el origen." : "La transferencia se marcará como cancelada.", confirmLabel: "Cancelar transferencia", destructive: true })) && act("cancel", undefined, "Transferencia cancelada")}>Cancelar</Button> : undefined}
      />
      <TwoColumn
        main={
          <Card title={`Productos (${tr.totalQuantity} unidades)`} padded={false}>
            <table className="w-full text-base">
              <thead className="text-sm text-muted-foreground"><tr className="border-b border-border"><th className="px-4 py-2 text-left font-medium sm:px-5">Producto</th><th className="px-3 py-2 text-right font-medium">Enviado</th><th className="px-3 py-2 text-right font-medium sm:pr-5">Recibido</th></tr></thead>
              <tbody className="divide-y divide-border">
                {tr.items.map((i) => (
                  <tr key={i.id} className="h-13">
                    <td className="px-4 py-2 sm:px-5"><ProductCell title={i.variant.product.title} variantTitle={i.variant.title} sku={i.variant.sku} thumbUrl={i.variant.product.thumbUrl} to={`/inventario/${i.variantId}/${tr.destinationLocationId}`} /></td>
                    <td className="px-3 py-2 text-right"><Qty value={i.quantity} /></td>
                    <td className={`px-3 py-2 text-right sm:pr-5 ${i.receivedQuantity < i.quantity ? "text-muted-foreground" : ""}`}><Qty value={i.receivedQuantity} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        }
        aside={
          <Card title="Detalles">
            <KeyValue items={[{ label: "Creada", value: <DateText value={tr.createdAt} time /> }, { label: "Despachada", value: <DateText value={tr.dispatchedAt} time /> }, { label: "Recibida", value: <DateText value={tr.receivedAt} time /> }, { label: "Llegada estimada", value: <DateText value={tr.expectedAt} /> }, ...(tr.note ? [{ label: "Nota", value: <span className="whitespace-pre-wrap text-left font-normal">{tr.note}</span> }] : [])]} />
            <Button variant="plain" size="sm" className="mt-3" onClick={() => navigate(`/movimientos?q=${encodeURIComponent(tr.number)}`)}>Ver movimientos generados</Button>
          </Card>
        }
      />
      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Recibir en {tr.destination.name}</DialogTitle><DialogDescription>Indica cuántas unidades llegaron. Puedes recibir parcialmente y completar después.</DialogDescription></DialogHeader>
          <DialogBody>
            <table className="w-full text-base">
              <thead className="text-sm text-muted-foreground"><tr className="border-b border-border"><th className="py-2 text-left font-medium">Producto</th><th className="py-2 text-right font-medium">Pendiente</th><th className="w-[120px] py-2 text-right font-medium">Recibir</th></tr></thead>
              <tbody className="divide-y divide-border">
                {pending.filter((i) => i.pending > 0).map((i) => (
                  <tr key={i.id}>
                    <td className="py-2"><ProductCell title={i.variant.product.title} variantTitle={i.variant.title} sku={i.variant.sku} thumbUrl={i.variant.product.thumbUrl} compact /></td>
                    <td className="py-2 text-right tabular text-muted-foreground">{i.pending}</td>
                    <td className="py-2"><Input type="number" min={0} max={i.pending} className="h-9 sm:h-8" value={receiveQty[i.variantId] ?? 0} invalid={(receiveQty[i.variantId] ?? 0) > i.pending} onChange={(e) => setReceiveQty((q) => ({ ...q, [i.variantId]: Math.max(0, Number(e.target.value)) }))} aria-label="Cantidad a recibir" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setReceiveOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={busy} disabled={pending.some((i) => (receiveQty[i.variantId] ?? 0) > i.pending) || Object.values(receiveQty).every((v) => !v)} onClick={() => act("receive", { items: Object.entries(receiveQty).map(([variantId, quantity]) => ({ variantId, quantity })) }, "Recepción registrada")}>Recibir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </Page>
  );
}
