import * as React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginBody } from "@inventario/shared";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/app/form";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

type Form = z.infer<typeof loginBody>;

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<Form>({ resolver: zodResolver(loginBody), defaultValues: { email: "", password: "" } });
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  React.useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, navigate, from]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await login(values.email, values.password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión.");
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#303030] text-white">
            <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M8 11.5 16 7l8 4.5v9L16 25l-8-4.5z" />
              <path d="M8 11.5 16 16l8-4.5M16 16v9" />
            </svg>
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-6">Inventario Willy</h1>
            <p className="text-sm text-muted-foreground">Inicia sesión para continuar</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="surface space-y-4 p-5" noValidate>
          <TextField control={form.control} name="email" label="Correo electrónico" inputProps={{ type: "email", autoComplete: "username", autoFocus: true, placeholder: "tu@correo.com" }} />
          <TextField control={form.control} name="password" label="Contraseña" inputProps={{ type: "password", autoComplete: "current-password" }} />
          {error ? (
            <p className="rounded-md bg-tone-critical-bg px-3 py-2 text-sm text-tone-critical-fg" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" className="w-full" loading={form.formState.isSubmitting}>
            Iniciar sesión
          </Button>
        </form>
      </div>
    </div>
  );
}
