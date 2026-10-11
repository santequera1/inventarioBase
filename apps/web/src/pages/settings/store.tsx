import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { updateStoreSettingsBody } from "@inventario/shared";
import { Card } from "@/components/app/page";
import { Field, FormRow, SelectField, TextField, TextareaField, UnsavedBar } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api, ApiError, v1 } from "@/lib/api";
import { useInvalidate, useSettings, type StoreSettings as S } from "@/lib/queries";
import { PageSkeleton } from "@/components/app/states";

type Form = z.infer<typeof updateStoreSettingsBody>;

export default function StoreSettings() {
  const settings = useSettings();
  const invalidate = useInvalidate();
  const form = useForm<Form>({ resolver: zodResolver(updateStoreSettingsBody) });
  React.useEffect(() => { if (settings.data) form.reset(toForm(settings.data)); }, [settings.data, form]);
  const save = form.handleSubmit(async (v) => {
    try { const s = await api.patch<S>(v1("/settings"), v); form.reset(toForm(s)); await invalidate("settings"); toast.success("Configuración guardada"); }
    catch (err) { if (err instanceof ApiError) { Object.entries(err.fieldErrors()).forEach(([k, m]) => form.setError(k as keyof Form, { message: m })); toast.error(err.message); } }
  });
  const [reconciling, setReconciling] = React.useState(false);
  const reconcile = async () => { setReconciling(true); try { const r = await api.post<{ checked: number; mismatches: number }>(v1("/settings/reconcile")); toast[r.mismatches ? "error" : "success"](`Conciliación: ${r.checked} niveles revisados, ${r.mismatches} diferencias`); } catch { toast.error("No se pudo conciliar"); } finally { setReconciling(false); } };
  if (!settings.data) return <PageSkeleton />;
  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      <UnsavedBar visible={form.formState.isDirty} onDiscard={() => form.reset(toForm(settings.data!))} onSave={() => void save()} saving={form.formState.isSubmitting} />
      <Card title="Tienda" description="Datos que aparecen en recibos y reportes.">
        <div className="space-y-4">
          <FormRow><TextField control={form.control} name="name" label="Nombre comercial" required /><TextField control={form.control} name="legalName" label="Razón social" /></FormRow>
          <FormRow cols={3}><TextField control={form.control} name="nit" label="NIT" /><TextField control={form.control} name="phone" label="Teléfono" /><TextField control={form.control} name="email" label="Correo" inputProps={{ type: "email" }} /></FormRow>
          <FormRow><TextField control={form.control} name="address" label="Dirección" /><TextField control={form.control} name="city" label="Ciudad" /></FormRow>
          <TextareaField control={form.control} name="receiptFooter" label="Pie del recibo" rows={2} placeholder="¡Gracias por su compra!" />
        </div>
      </Card>
      <Card title="Impuestos y precios">
        <div className="space-y-4">
          <FormRow><SelectField control={form.control} name="defaultTaxRate" label="IVA por defecto para nuevos productos" numeric options={[{ value: "0", label: "0 %" }, { value: "5", label: "5 %" }, { value: "19", label: "19 %" }]} />
            <Controller control={form.control} name="pricesIncludeTax" render={({ field }) => <Field label="Los precios incluyen IVA" help="Habitual en Colombia: el precio de venta ya trae el IVA y el recibo lo desglosa."><div className="flex h-9 items-center"><Switch checked={!!field.value} onCheckedChange={field.onChange} /></div></Field>} /></FormRow>
        </div>
      </Card>
      <Card title="Inventario">
        <div className="space-y-4">
          <Controller control={form.control} name="allowNegativeStock" render={({ field }) => <Field label="Permitir stock negativo" help="Desactivado por defecto: las ventas y ajustes que dejen Disponible por debajo de cero se rechazan."><div className="flex h-9 items-center"><Switch checked={!!field.value} onCheckedChange={field.onChange} /></div></Field>} />
          <FormRow><TextField control={form.control} name="lowStockThreshold" label="Umbral global de stock bajo" parse="int" help="Se usa cuando la variante no tiene stock mínimo propio." /></FormRow>
          <div className="rounded-md border border-border p-3"><div className="flex items-center justify-between gap-3"><div><div className="font-medium">Conciliar niveles con el libro mayor</div><div className="text-sm text-muted-foreground">Comprueba que cada nivel coincide con la suma de sus movimientos.</div></div><Button type="button" variant="secondary" loading={reconciling} onClick={reconcile}>Ejecutar</Button></div></div>
        </div>
      </Card>
      <Card title="Numeración de órdenes">
        <FormRow><TextField control={form.control} name="orderPrefix" label="Prefijo" help="Ej. “#” o “VT-”." /><TextField control={form.control} name="orderNextNumber" label="Siguiente número" parse="int" /></FormRow>
      </Card>
      <div className="flex justify-end"><Button type="submit" variant="primary" loading={form.formState.isSubmitting} disabled={!form.formState.isDirty}>Guardar</Button></div>
    </form>
  );
}
function toForm(s: S): Form {
  return { name: s.name, legalName: s.legalName ?? "", nit: s.nit ?? "", address: s.address ?? "", city: s.city ?? "", phone: s.phone ?? "", email: s.email ?? "", receiptFooter: s.receiptFooter ?? "", allowNegativeStock: s.allowNegativeStock, defaultTaxRate: s.defaultTaxRate as 0 | 5 | 19, pricesIncludeTax: s.pricesIncludeTax, orderPrefix: s.orderPrefix, orderNextNumber: s.orderNextNumber, lowStockThreshold: s.lowStockThreshold };
}
