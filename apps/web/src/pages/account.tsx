import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { changePasswordBody } from "@inventario/shared";
import { Page, PageHeader, Card, KeyValue } from "@/components/app/page";
import { TextField } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DateText } from "@/components/app/format";

type Form = z.infer<typeof changePasswordBody>;

export default function AccountPage() {
  const { user } = useAuth();
  const form = useForm<Form>({ resolver: zodResolver(changePasswordBody), defaultValues: { currentPassword: "", newPassword: "" } });
  const submit = form.handleSubmit(async (v) => {
    try {
      await api.post("/api/auth/change-password", v);
      toast.success("Contraseña actualizada");
      form.reset();
    } catch (err) {
      if (err instanceof ApiError) {
        const fe = err.fieldErrors();
        for (const [k, m] of Object.entries(fe)) form.setError(k as keyof Form, { message: m });
        if (!Object.keys(fe).length) toast.error(err.message);
      }
    }
  });
  return (
    <Page width="narrow">
      <PageHeader title="Mi cuenta" />
      <div className="flex flex-col gap-4">
        <Card title="Datos">
          <KeyValue items={[{ label: "Nombre", value: user?.name }, { label: "Correo", value: user?.email }, { label: "Rol", value: user?.role.name }, { label: "Último acceso", value: <DateText value={user?.lastLoginAt} time /> }]} />
        </Card>
        <Card title="Cambiar contraseña" description="Al cambiarla se cerrarán tus otras sesiones.">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <TextField control={form.control} name="currentPassword" label="Contraseña actual" inputProps={{ type: "password", autoComplete: "current-password" }} />
            <TextField control={form.control} name="newPassword" label="Nueva contraseña" help="Mínimo 8 caracteres." inputProps={{ type: "password", autoComplete: "new-password" }} />
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>Actualizar contraseña</Button>
            </div>
          </form>
        </Card>
      </div>
    </Page>
  );
}
