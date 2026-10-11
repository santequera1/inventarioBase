import * as React from "react";
import { toast } from "sonner";
import { Card } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError, v1 } from "@/lib/api";
import { useInvalidate, type Reason } from "@/lib/queries";
import { useQuery } from "@tanstack/react-query";

const KINDS: Record<string, string> = { ADJUSTMENT: "Ajustes de cantidad", UNAVAILABLE: "Marcar como no disponible", RETURN: "Devoluciones" };

export default function ReasonsSettings() {
  const reasons = useQuery({ queryKey: ["reasons", "all-kinds"], queryFn: () => api.get<{ data: Reason[] }>(v1("/reasons")), select: (d) => d.data });
  const invalidate = useInvalidate();
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState("ADJUSTMENT");
  const add = async () => { try { await api.post(v1("/reasons"), { name: name.trim(), kind }); setName(""); await invalidate("reasons"); toast.success("Motivo creado"); } catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo crear"); } };
  const toggle = async (r: Reason) => { try { await api.patch(v1(`/reasons/${r.id}`), { active: !r.active }); await invalidate("reasons"); } catch { toast.error("No se pudo actualizar"); } };
  const remove = async (r: Reason) => { try { await api.delete(v1(`/reasons/${r.id}`)); await invalidate("reasons"); toast.success("Motivo eliminado"); } catch { toast.error("No se pudo eliminar"); } };
  return (
    <div className="flex flex-col gap-4">
      <Card title="Nuevo motivo" description="Los motivos obligan a explicar cada ajuste y quedan en el historial.">
        <div className="flex flex-col gap-2 sm:flex-row"><Input placeholder="Ej. Muestra para cliente" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim().length >= 2 && add()} /><Select value={kind} onValueChange={setKind}><SelectTrigger className="sm:w-64"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(KINDS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select><Button variant="primary" disabled={name.trim().length < 2} onClick={add}>Agregar</Button></div>
      </Card>
      {Object.entries(KINDS).map(([k, label]) => (
        <Card key={k} title={label} padded={false}>
          <ul className="divide-y divide-border">
            {(reasons.data ?? []).filter((r) => r.kind === k).map((r) => <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5"><span className={r.active ? "" : "text-muted-foreground line-through"}>{r.name}</span><div className="flex items-center gap-2"><Switch checked={r.active} onCheckedChange={() => toggle(r)} aria-label="Activo" /><Button variant="ghost" size="sm" onClick={() => remove(r)}>Eliminar</Button></div></li>)}
            {(reasons.data ?? []).filter((r) => r.kind === k).length === 0 ? <li className="px-4 py-3 text-sm text-muted-foreground">Sin motivos.</li> : null}
          </ul>
        </Card>
      ))}
    </div>
  );
}
