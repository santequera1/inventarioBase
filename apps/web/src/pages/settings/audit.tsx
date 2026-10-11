import * as React from "react";
import { Card } from "@/components/app/page";
import { DataTable, useCursorPagination } from "@/components/app/data-table";
import { DateText } from "@/components/app/format";
import { EmptyState } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { usePage, type AuditLog } from "@/lib/queries";
import { useDebounce } from "@/lib/hooks";
import type { ColumnDef } from "@tanstack/react-table";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function AuditSettings() {
  const [entity, setEntity] = React.useState("");
  const de = useDebounce(entity);
  const pag = useCursorPagination(de);
  const logs = usePage<AuditLog>("audit", "/audit-logs", { entity: de || undefined, limit: 50, cursor: pag.cursor });
  const [inspect, setInspect] = React.useState<AuditLog | null>(null);
  const columns = React.useMemo<ColumnDef<AuditLog, unknown>[]>(() => [
    { id: "date", header: "Fecha", cell: ({ row }) => <DateText value={row.original.createdAt} time className="text-muted-foreground" />, meta: { className: "whitespace-nowrap" } },
    { id: "actor", header: "Usuario", cell: ({ row }) => <span>{row.original.actorName ?? "Sistema"}{row.original.actorType === "API_KEY" ? <Badge tone="outline" className="ml-1.5">API</Badge> : null}</span> },
    { id: "action", header: "Acción", cell: ({ row }) => <Badge tone="neutral">{row.original.action}</Badge>, meta: { className: "w-[130px]" } },
    { id: "entity", header: "Entidad", cell: ({ row }) => <span className="tabular">{row.original.entity}{row.original.entityId ? <span className="text-muted-foreground"> · {row.original.entityId.slice(-8)}</span> : null}</span> },
    { id: "ip", header: "IP", cell: ({ row }) => <span className="tabular text-muted-foreground">{row.original.ip ?? "—"}</span>, meta: { className: "hidden lg:table-cell" } },
  ], []);
  return (
    <Card title="Auditoría" description="Acciones relevantes: quién hizo qué y cuándo." padded={false} actions={<Input placeholder="Filtrar por entidad (product, order…)" value={entity} onChange={(e) => setEntity(e.target.value)} className="h-8 w-64" />}>
      <DataTable columns={columns} data={logs.data?.data ?? []} loading={logs.isLoading} getRowId={(r) => r.id} onRowClick={(r) => setInspect(r)} dense pagination={{ hasMore: logs.data?.meta.has_more ?? false, onNext: () => pag.next(logs.data?.meta.next_cursor ?? null), onPrev: pag.prev, canPrev: pag.canPrev, total: logs.data?.meta.total, shown: logs.data?.data.length ?? 0 }} empty={<EmptyState compact title="Sin registros" />} />
      <Dialog open={!!inspect} onOpenChange={(o) => !o && setInspect(null)}>
        <DialogContent size="lg"><DialogHeader><DialogTitle>{inspect?.action} · {inspect?.entity}</DialogTitle></DialogHeader><DialogBody className="grid gap-3 sm:grid-cols-2"><div><div className="mb-1 text-sm font-medium text-muted-foreground">Antes</div><pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">{inspect?.before ? JSON.stringify(inspect.before, null, 2) : "—"}</pre></div><div><div className="mb-1 text-sm font-medium text-muted-foreground">Después</div><pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">{inspect?.after ? JSON.stringify(inspect.after, null, 2) : "—"}</pre></div></DialogBody></DialogContent>
      </Dialog>
    </Card>
  );
}
