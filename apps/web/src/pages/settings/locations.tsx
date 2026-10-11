import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { createLocationBody } from "@inventario/shared";
import { Card } from "@/components/app/page";
import { Field, FormRow, TextField } from "@/components/app/form";
import { ActiveBadge } from "@/components/app/badges";
import { useConfirm } from "@/components/app/confirm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError, v1 } from "@/lib/api";
import { useInvalidate, useLocations, type Location } from "@/lib/queries";

type Form = z.infer<typeof createLocationBody>;
const empty: Form = { name: "", address: "", city: "", phone: "", isDefault: false, active: true, sellsOnline: true };

export default function LocationsSettings() {
  const locations = useLocations();
  const invalidate = useInvalidate();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = React.useState<Location | "new" | null>(null);
  const form = useForm<Form>({ resolver: zodResolver(createLocationBody), defaultValues: empty });
  React.useEffect(() => { if (editing) form.reset(editing === "new" ? empty : { name: editing.name, address: editing.address ?? "", city: editing.city ?? "", phone: editing.phone ?? "", isDefault: editing.isDefault, active: editing.active, sellsOnline: editing.sellsOnline }); }, [editing, form]);
  const submit = form.handleSubmit(async (v) => {
    try { if (editing === "new") await api.post(v1("/locations"), v); else if (editing) await api.patch(v1(`/locations/${editing.id}`), v); toast.success("Ubicación guardada"); await invalidate("locations", "inventory-levels"); setEditing(null); }
    catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo guardar"); }
  });
  const remove = async (l: Location) => {
    if (!(await confirm({ title: `¿Eliminar ${l.name}?`, description: "Solo es posible si no tiene existencias. Si tiene historial se desactivará.", confirmLabel: "Eliminar", destructive: true }))) return;
    try { await api.delete(v1(`/locations/${l.id}`)); toast.success("Ubicación eliminada"); await invalidate("locations"); } catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo eliminar"); }
  };
  return (
    <Card title="Ubicaciones" description="Tiendas y bodegas donde se controla el inventario." padded={false} actions={<Button variant="primary" size="sm" onClick={() => setEditing("new")}>Agregar ubicación</Button>}>
      <ul className="divide-y divide-border">
        {(locations.data ?? []).map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0"><div className="flex items-center gap-2"><span className="font-medium">{l.name}</span>{l.isDefault ? <Badge tone="info">Predeterminada</Badge> : null}<ActiveBadge active={l.active} /></div><div className="truncate text-sm text-muted-foreground">{[l.address, l.city, l.phone].filter(Boolean).join(" · ") || "Sin dirección"}</div></div>
            <div className="flex shrink-0 gap-1"><Button variant="secondary" size="sm" onClick={() => setEditing(l)}>Editar</Button>{!l.isDefault ? <Button variant="ghost" size="sm" onClick={() => remove(l)}>Eliminar</Button> : null}</div>
          </li>
        ))}
      </ul>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing === "new" ? "Nueva ubicación" : "Editar ubicación"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} noValidate>
            <DialogBody className="space-y-4">
              <TextField control={form.control} name="name" label="Nombre" required />
              <FormRow><TextField control={form.control} name="address" label="Dirección" /><TextField control={form.control} name="city" label="Ciudad" /></FormRow>
              <TextField control={form.control} name="phone" label="Teléfono" />
              <Controller control={form.control} name="isDefault" render={({ field }) => <Field label="Ubicación predeterminada" inline help="Se usa por defecto en POS y stock inicial."><Switch checked={!!field.value} onCheckedChange={field.onChange} /></Field>} />
              <Controller control={form.control} name="active" render={({ field }) => <Field label="Activa" inline><Switch checked={!!field.value} onCheckedChange={field.onChange} /></Field>} />
            </DialogBody>
            <DialogFooter><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" variant="primary" loading={form.formState.isSubmitting}>Guardar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {dialog}
    </Card>
  );
}
