import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { createPaymentMethodBody } from "@inventario/shared";
import { Card } from "@/components/app/page";
import { Field, FormRow, SelectField, TextField } from "@/components/app/form";
import { ActiveBadge } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError, v1 } from "@/lib/api";
import { useInvalidate, usePaymentMethods, type PaymentMethod } from "@/lib/queries";

type Form = z.infer<typeof createPaymentMethodBody>;
const TYPES: Record<string, string> = { CASH: "Efectivo (calcula cambio y entra en caja)", CARD: "Tarjeta", TRANSFER: "Transferencia", WALLET: "Billetera (Nequi, Daviplata…)", OTHER: "Otro" };

export default function PaymentsSettings() {
  const methods = usePaymentMethods(false);
  const invalidate = useInvalidate();
  const [editing, setEditing] = React.useState<PaymentMethod | "new" | null>(null);
  const form = useForm<Form>({ resolver: zodResolver(createPaymentMethodBody), defaultValues: { name: "", code: "", type: "OTHER", active: true, requiresReference: false } });
  React.useEffect(() => { if (editing) form.reset(editing === "new" ? { name: "", code: "", type: "OTHER", active: true, requiresReference: false } : { name: editing.name, code: editing.code, type: editing.type, active: editing.active, requiresReference: editing.requiresReference }); }, [editing, form]);
  const submit = form.handleSubmit(async (v) => {
    try { if (editing === "new") await api.post(v1("/payment-methods"), v); else if (editing) await api.patch(v1(`/payment-methods/${editing.id}`), v); toast.success("Método guardado"); await invalidate("payment-methods"); setEditing(null); }
    catch (err) { if (err instanceof ApiError) { Object.entries(err.fieldErrors()).forEach(([k, m]) => form.setError(k as keyof Form, { message: m })); toast.error(err.message); } }
  });
  const toggle = async (m: PaymentMethod) => { try { await api.patch(v1(`/payment-methods/${m.id}`), { active: !m.active }); await invalidate("payment-methods"); } catch { toast.error("No se pudo actualizar"); } };
  return (
    <Card title="Métodos de pago" description="Los métodos activos aparecen en el POS y se pueden combinar en una misma venta." padded={false} actions={<Button variant="primary" size="sm" onClick={() => setEditing("new")}>Agregar método</Button>}>
      <ul className="divide-y divide-border">
        {(methods.data ?? []).map((m) => <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"><div><div className="flex items-center gap-2"><span className="font-medium">{m.name}</span><Badge tone="outline">{m.code}</Badge><ActiveBadge active={m.active} /></div><div className="text-sm text-muted-foreground">{TYPES[m.type]?.split(" (")[0]}{m.requiresReference ? " · requiere referencia" : ""}</div></div><div className="flex items-center gap-2"><Switch checked={m.active} onCheckedChange={() => toggle(m)} aria-label="Activo" /><Button variant="secondary" size="sm" onClick={() => setEditing(m)}>Editar</Button></div></li>)}
      </ul>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{editing === "new" ? "Nuevo método de pago" : "Editar método"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} noValidate>
            <DialogBody className="space-y-4">
              <FormRow><TextField control={form.control} name="name" label="Nombre" required /><TextField control={form.control} name="code" label="Código" required help="Minúsculas, sin espacios. Se usa en la API." inputProps={{ disabled: editing !== "new" }} /></FormRow>
              <SelectField control={form.control} name="type" label="Tipo" options={Object.entries(TYPES).map(([value, label]) => ({ value, label }))} />
              <Controller control={form.control} name="requiresReference" render={({ field }) => <Field label="Requiere número de referencia" inline><Switch checked={!!field.value} onCheckedChange={field.onChange} /></Field>} />
            </DialogBody>
            <DialogFooter><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" variant="primary" loading={form.formState.isSubmitting}>Guardar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
