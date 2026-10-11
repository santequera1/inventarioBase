import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { createCustomerBody } from "@inventario/shared";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormRow, SelectField, TextField, TextareaField } from "@/components/app/form";
import { api, ApiError, v1 } from "@/lib/api";
import { useInvalidate, type Customer } from "@/lib/queries";

type Form = z.infer<typeof createCustomerBody>;
const empty: Form = { firstName: "", lastName: "", documentType: "CC", documentNumber: "", email: "", phone: "", address: "", city: "", companyName: "", notes: "", tags: [] };

export function CustomerFormDialog({ open, onOpenChange, customer, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; customer?: Customer | null; onSaved?: (c: Customer) => void }) {
  const invalidate = useInvalidate();
  const form = useForm<Form>({ resolver: zodResolver(createCustomerBody), defaultValues: empty });
  React.useEffect(() => { if (open) form.reset(customer ? { ...empty, ...customer, email: customer.email ?? "", documentType: customer.documentType ?? "CC" } : empty); }, [open, customer, form]);
  const submit = form.handleSubmit(async (v) => {
    try {
      const saved = customer ? await api.patch<Customer>(v1(`/customers/${customer.id}`), v) : await api.post<Customer>(v1("/customers"), v);
      toast.success(customer ? "Cliente actualizado" : "Cliente creado");
      await invalidate("customers", "customer");
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) { Object.entries(err.fieldErrors()).forEach(([k, m]) => form.setError(k as keyof Form, { message: m })); toast.error(err.message); }
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{customer ? "Editar cliente" : "Nuevo cliente"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} noValidate>
          <DialogBody className="space-y-4">
            <FormRow><TextField control={form.control} name="firstName" label="Nombre" required /><TextField control={form.control} name="lastName" label="Apellido" /></FormRow>
            <FormRow cols={3}><SelectField control={form.control} name="documentType" label="Tipo de documento" options={[{ value: "CC", label: "CC" }, { value: "NIT", label: "NIT" }, { value: "CE", label: "CE" }, { value: "PASAPORTE", label: "Pasaporte" }, { value: "OTRO", label: "Otro" }]} /><TextField control={form.control} name="documentNumber" label="Número de documento" /><TextField control={form.control} name="companyName" label="Empresa" /></FormRow>
            <FormRow><TextField control={form.control} name="email" label="Correo" inputProps={{ type: "email" }} /><TextField control={form.control} name="phone" label="Teléfono" inputProps={{ type: "tel" }} /></FormRow>
            <FormRow><TextField control={form.control} name="address" label="Dirección" /><TextField control={form.control} name="city" label="Ciudad" /></FormRow>
            <TextareaField control={form.control} name="notes" label="Notas" rows={2} />
          </DialogBody>
          <DialogFooter><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" variant="primary" loading={form.formState.isSubmitting}>Guardar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
