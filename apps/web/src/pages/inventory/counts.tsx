import * as React from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Page, PageHeader } from "@/components/app/page";
import { DataTable, useCursorPagination } from "@/components/app/data-table";
import { IndexTableHeader, type ViewTab } from "@/components/app/index-table";
import { DateText, Qty } from "@/components/app/format";
import { CountStatusBadge } from "@/components/app/badges";
import { EmptyState, ErrorState } from "@/components/app/states";
import { Field } from "@/components/app/form";
import { LocationSelect } from "@/components/app/pickers";
import { ProductCell } from "@/components/app/product-cell";
import { VariantPicker, type VariantHit } from "@/components/app/variant-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useUrlState } from "@/lib/hooks";
import { useInvalidate, usePage, type StockCount } from "@/lib/queries";
import { newIdempotencyKey } from "@/lib/utils";

export default function CountsPage() {
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const [url, setUrl] = useUrlState({ view: "all" });
  const status = url.view !== "all" ? url.view : undefined;
  const pag = useCursorPagination(url.view);
  const counts = usePage<StockCount>("counts", "/stock-counts", { status, limit: 50, cursor: pag.cursor });
  const [open, setOpen] = React.useState(false);
  const tabs: ViewTab[] = [{ id: "all", label: "Todos", filters: {} }, { id: "OPEN", label: "Abiertos", filters: {} }, { id: "APPLIED", label: "Aplicados", filters: {} }];
  const columns = React.useMemo<ColumnDef<StockCount, unknown>[]>(() => [
    { id: "number", header: "Conteo", cell: ({ row }) => <span className="font-medium tabular">{row.original.number}</span>, meta: { className: "w-[120px]" } },
    { id: "location", header: "Ubicación", cell: ({ row }) => row.original.location.name },
    { id: "status", header: "Estado", cell: ({ row }) => <CountStatusBadge status={row.original.status} />, meta: { className: "w-[120px]" } },
    { id: "created", header: "Creado", cell: ({ row }) => <DateText value={row.original.createdAt} time className="text-muted-foreground" />, meta: { className: "hidden md:table-cell" } },
    { id: "items", header: "Productos", cell: ({ row }) => <Qty value={row.original.items.length} />, meta: { numeric: true } },
    { id: "diff", header: "Diferencia", cell: ({ row }) => <Qty value={row.original.items.reduce((a, i) => a + i.difference, 0)} signed className="font-medium" />, meta: { numeric: true } },
  ], []);
  return (
    <Page width="wide">
      <PageHeader backTo="/inventario" title="Conteos físicos" subtitle="Compara lo contado con lo esperado y aplica las diferencias como ajustes con modo “Establecer cantidad final”." primaryAction={can("inventory.count") ? <Button variant="primary" onClick={() => setOpen(true)}>Nuevo conteo</Button> : undefined} />
      <div className="surface overflow-hidden">
        <IndexTableHeader resource="counts" tabs={tabs} activeTab={url.view} onTabChange={(t) => setUrl({ view: t.id })} search="" onSearchChange={() => undefined} searchPlaceholder="—" />
        {counts.isError ? <ErrorState error={counts.error} /> : <DataTable columns={columns} data={counts.data?.data ?? []} loading={counts.isLoading} getRowId={(r) => r.id} onRowClick={(r) => navigate(`/inventario/conteos/${r.id}`)} pagination={{ hasMore: counts.data?.meta.has_more ?? false, onNext: () => pag.next(counts.data?.meta.next_cursor ?? null), onPrev: pag.prev, canPrev: pag.canPrev, total: counts.data?.meta.total, shown: counts.data?.data.length ?? 0 }} empty={<EmptyState title="Sin conteos" description="Crea un conteo, registra lo que hay físicamente y aplica las diferencias." action={can("inventory.count") ? <Button variant="primary" onClick={() => setOpen(true)}>Nuevo conteo</Button> : undefined} />} />}
      </div>
      <NewCountDialog open={open} onOpenChange={setOpen} defaultLocationId={user?.defaultLocationId ?? ""} />
    </Page>
  );
}

function NewCountDialog({ open, onOpenChange, defaultLocationId }: { open: boolean; onOpenChange: (o: boolean) => void; defaultLocationId: string }) {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const [locationId, setLocationId] = React.useState(defaultLocationId);
  const [lines, setLines] = React.useState<{ variant: VariantHit; counted: number }[]>([]);
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { if (open) { setLines([]); setNote(""); setLocationId(defaultLocationId); } }, [open, defaultLocationId]);
  const submit = async () => {
    setSaving(true);
    try {
      const c = await api.post<StockCount>(v1("/stock-counts"), { locationId, note: note || undefined, items: lines.map((l) => ({ variantId: l.variant.id, counted: l.counted })) }, newIdempotencyKey());
      toast.success(`Conteo ${c.number} creado`);
      await invalidate("counts");
      onOpenChange(false);
      navigate(`/inventario/conteos/${c.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear el conteo");
    } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>Nuevo conteo físico</DialogTitle><DialogDescription>El sistema toma el Disponible actual como esperado. Escribe lo que contaste.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Ubicación" required htmlFor="count-loc"><LocationSelect id="count-loc" value={locationId} onChange={setLocationId} className="w-full" /></Field>
          <Field label="Productos" required><VariantPicker locationId={locationId} activeOnly={false} onPick={(v) => setLines((ls) => (ls.some((l) => l.variant.id === v.id) ? ls : [...ls, { variant: v, counted: v.available ?? 0 }]))} /></Field>
          {lines.length ? (
            <table className="w-full text-base">
              <thead className="text-sm text-muted-foreground"><tr className="border-b border-border"><th className="py-2 text-left font-medium">Producto</th><th className="py-2 text-right font-medium">Esperado</th><th className="w-[110px] py-2 text-right font-medium">Contado</th><th className="w-[80px] py-2 text-right font-medium">Dif.</th><th className="w-8"></th></tr></thead>
              <tbody className="divide-y divide-border">
                {lines.map((l) => (
                  <tr key={l.variant.id}>
                    <td className="py-1.5"><ProductCell title={l.variant.product.title} variantTitle={l.variant.title} sku={l.variant.sku} thumbUrl={l.variant.product.thumbUrl} compact /></td>
                    <td className="py-1.5 text-right tabular text-muted-foreground">{l.variant.available ?? 0}</td>
                    <td className="py-1.5"><Input type="number" min={0} className="h-8" value={l.counted} onChange={(e) => setLines((ls) => ls.map((x) => (x.variant.id === l.variant.id ? { ...x, counted: Math.max(0, Number(e.target.value)) } : x)))} aria-label="Contado" /></td>
                    <td className="py-1.5 text-right"><Qty value={l.counted - (l.variant.available ?? 0)} signed className="font-medium" /></td>
                    <td className="py-1.5 text-right"><Button variant="ghost" size="icon-sm" aria-label="Quitar" onClick={() => setLines((ls) => ls.filter((x) => x.variant.id !== l.variant.id))}><Trash2 /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <Field label="Nota" htmlFor="count-note"><Textarea id="count-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" disabled={!locationId || lines.length === 0} loading={saving} onClick={submit}>Crear conteo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
