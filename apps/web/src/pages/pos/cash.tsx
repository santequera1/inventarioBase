import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Page, PageHeader, Card, KeyValue } from "@/components/app/page";
import { DataTable, useCursorPagination } from "@/components/app/data-table";
import { LocationSelect } from "@/components/app/pickers";
import { Field } from "@/components/app/form";
import { DateText, Money, Qty } from "@/components/app/format";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useSelectedLocation } from "@/lib/hooks";
import { useInvalidate, usePage, type CashSession } from "@/lib/queries";
import { cn } from "@/lib/utils";

export default function CashPage() {
  const { user } = useAuth();
  const [locationId, setLocationId] = useSelectedLocation(user?.defaultLocationId);
  const invalidate = useInvalidate();
  const current = useQuery({ queryKey: ["cash-current", locationId], queryFn: () => api.get<{ session: CashSession | null }>(v1("/cash-sessions/current"), { location_id: locationId }), enabled: !!locationId });
  const pag = useCursorPagination(locationId);
  const history = usePage<CashSession>("cash-sessions", "/cash-sessions", { location_id: locationId || undefined, status: "CLOSED", limit: 20, cursor: pag.cursor });
  const [dialog, setDialog] = React.useState<null | "open" | "close" | "movement">(null);
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [movType, setMovType] = React.useState<"IN" | "OUT">("OUT");
  const [busy, setBusy] = React.useState(false);
  const s = current.data?.session ?? null;

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); toast.success(msg); await invalidate("cash-current", "cash-sessions", "home"); setDialog(null); setAmount(""); setNote(""); }
    catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo completar"); } finally { setBusy(false); }
  };
  const columns = React.useMemo<ColumnDef<CashSession, unknown>[]>(() => [
    { id: "opened", header: "Apertura", cell: ({ row }) => <DateText value={row.original.openedAt} time /> },
    { id: "closed", header: "Cierre", cell: ({ row }) => <DateText value={row.original.closedAt} time className="text-muted-foreground" />, meta: { className: "hidden md:table-cell" } },
    { id: "by", header: "Abrió / cerró", cell: ({ row }) => <span className="text-muted-foreground">{row.original.openedByName}{row.original.closedByName && row.original.closedByName !== row.original.openedByName ? ` / ${row.original.closedByName}` : ""}</span>, meta: { className: "hidden lg:table-cell" } },
    { id: "orders", header: "Ventas", cell: ({ row }) => <Qty value={row.original.ordersCount} />, meta: { numeric: true, className: "hidden sm:table-cell" } },
    { id: "expected", header: "Esperado", cell: ({ row }) => <Money value={row.original.expectedAmount} />, meta: { numeric: true } },
    { id: "closing", header: "Contado", cell: ({ row }) => <Money value={row.original.closingAmount} />, meta: { numeric: true } },
    { id: "diff", header: "Diferencia", cell: ({ row }) => { const d = row.original.difference ?? 0; return <span className={cn("tabular font-medium", d < 0 && "text-destructive", d > 0 && "text-tone-success-fg")}>{d > 0 ? "+" : ""}<Money value={d} /></span>; }, meta: { numeric: true } },
  ], []);

  return (
    <Page>
      <PageHeader title="Caja" subtitle="Apertura, entradas/salidas de efectivo y cierre con arqueo." secondaryActions={<LocationSelect value={locationId} onChange={setLocationId} />} primaryAction={s ? <Button variant="primary" onClick={() => { setAmount(String(s.expectedAmount ?? "")); setDialog("close"); }}>Cerrar caja</Button> : <Button variant="primary" disabled={!locationId} onClick={() => setDialog("open")}>Abrir caja</Button>} />
      {s ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card title="Caja abierta" description={<span>Abierta <DateText value={s.openedAt} time /> por {s.openedByName}</span>} actions={<Badge tone="success">Abierta</Badge>}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <Stat label="Base inicial" value={s.openingAmount} />
              <Stat label="Ventas en efectivo" value={s.cashSales} />
              <Stat label="Reembolsos en efectivo" value={-s.cashRefunds} />
              <Stat label="Entradas" value={s.cashIn} />
              <Stat label="Salidas" value={-s.cashOut} />
              <Stat label="Efectivo esperado" value={s.expectedAmount ?? 0} strong />
            </div>
            <div className="mt-4 flex gap-2"><Button variant="secondary" onClick={() => { setMovType("IN"); setDialog("movement"); }}>Registrar entrada</Button><Button variant="secondary" onClick={() => { setMovType("OUT"); setDialog("movement"); }}>Registrar salida</Button></div>
          </Card>
          <Card title="Ventas de la sesión">
            <KeyValue items={[{ label: "Órdenes", value: s.ordersCount, numeric: true }, { label: "Total vendido", value: <Money value={s.salesTotal} />, numeric: true }, ...s.byMethod.map((m) => ({ label: m.methodName, value: <Money value={m.total} />, numeric: true }))]} />
          </Card>
        </div>
      ) : locationId ? <Card><EmptyState compact title="No hay caja abierta" description="Abre la caja con la base inicial de efectivo para registrar ventas y hacer el arqueo al cierre." action={<Button variant="primary" onClick={() => setDialog("open")}>Abrir caja</Button>} /></Card> : null}

      <div className="mt-4 surface overflow-hidden">
        <div className="border-b border-border px-4 py-3"><h2 className="section-title">Cierres anteriores</h2></div>
        <DataTable columns={columns} data={history.data?.data ?? []} loading={history.isLoading} getRowId={(r) => r.id} pagination={{ hasMore: history.data?.meta.has_more ?? false, onNext: () => pag.next(history.data?.meta.next_cursor ?? null), onPrev: pag.prev, canPrev: pag.canPrev, total: history.data?.meta.total, shown: history.data?.data.length ?? 0 }} empty={<EmptyState compact title="Sin cierres" description="Aquí aparecerán los arqueos de caja." />} />
      </div>

      <Dialog open={dialog === "open"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Abrir caja</DialogTitle><DialogDescription>Cuenta el efectivo con el que inicias.</DialogDescription></DialogHeader>
          <DialogBody className="space-y-4"><Field label="Base inicial" required htmlFor="open-amt"><Input id="open-amt" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field><Field label="Nota" htmlFor="open-note"><Textarea id="open-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field></DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setDialog(null)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={amount === ""} onClick={() => run(() => api.post(v1("/cash-sessions"), { locationId, openingAmount: Number(amount), note: note || undefined }), "Caja abierta")}>Abrir</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "close"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Cerrar caja</DialogTitle><DialogDescription>Cuenta el efectivo real. Se registrará la diferencia frente a lo esperado.</DialogDescription></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="flex justify-between rounded-md bg-muted/60 px-3 py-2 text-base"><span className="text-muted-foreground">Efectivo esperado</span><Money value={s?.expectedAmount} className="font-medium" /></div>
            <Field label="Efectivo contado" required htmlFor="close-amt"><Input id="close-amt" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
            {amount !== "" && s ? <div className={cn("flex justify-between text-base font-medium", Number(amount) - (s.expectedAmount ?? 0) < 0 ? "text-destructive" : Number(amount) - (s.expectedAmount ?? 0) > 0 ? "text-tone-success-fg" : "")}><span>Diferencia</span><Money value={Number(amount) - (s.expectedAmount ?? 0)} /></div> : null}
            <Field label="Nota" htmlFor="close-note"><Textarea id="close-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setDialog(null)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={amount === ""} onClick={() => run(() => api.post(v1(`/cash-sessions/${s!.id}/close`), { closingAmount: Number(amount), note: note || undefined }), "Caja cerrada")}>Cerrar caja</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "movement"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{movType === "IN" ? "Entrada de efectivo" : "Salida de efectivo"}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <Field label="Tipo"><Select value={movType} onValueChange={(v) => setMovType(v as "IN")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="IN">Entrada</SelectItem><SelectItem value="OUT">Salida</SelectItem></SelectContent></Select></Field>
            <Field label="Monto" required htmlFor="mov-amt"><Input id="mov-amt" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
            <Field label="Motivo" required htmlFor="mov-note"><Input id="mov-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pago a domiciliario, cambio…" /></Field>
          </DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setDialog(null)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!amount || note.trim().length < 2} onClick={() => run(() => api.post(v1(`/cash-sessions/${s!.id}/movements`), { type: movType, amount: Number(amount), reason: note }), "Movimiento registrado")}>Registrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return <div><div className="text-sm text-muted-foreground">{label}</div><div className={cn("tabular text-md", strong ? "font-semibold" : "font-medium")}><Money value={value} /></div></div>;
}
