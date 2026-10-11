import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { createUserBody, createRoleBody, PERMISSIONS, permissionLabels } from "@inventario/shared";
import { Card } from "@/components/app/page";
import { Field, FormRow, SelectField, TextField } from "@/components/app/form";
import { ActiveBadge } from "@/components/app/badges";
import { DateText } from "@/components/app/format";
import { useConfirm } from "@/components/app/confirm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInvalidate, useLocations, type AppUser, type Role } from "@/lib/queries";

const userForm = createUserBody.extend({ password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").optional().or(z.literal("")) });
type UserForm = z.infer<typeof userForm>;
type RoleForm = z.infer<typeof createRoleBody>;

export default function UsersSettings() {
  const { user: me } = useAuth();
  const invalidate = useInvalidate();
  const { confirm, dialog } = useConfirm();
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<{ data: AppUser[] }>(v1("/users")), select: (d) => d.data });
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api.get<{ data: Role[] }>(v1("/roles")), select: (d) => d.data });
  const locations = useLocations();
  const [editingUser, setEditingUser] = React.useState<AppUser | "new" | null>(null);
  const [editingRole, setEditingRole] = React.useState<Role | "new" | null>(null);
  const uf = useForm<UserForm>({ resolver: zodResolver(userForm), defaultValues: { email: "", name: "", password: "", roleId: "", defaultLocationId: null, active: true } });
  const rf = useForm<RoleForm>({ resolver: zodResolver(createRoleBody), defaultValues: { name: "", permissions: [] } });
  React.useEffect(() => { if (editingUser) uf.reset(editingUser === "new" ? { email: "", name: "", password: "", roleId: roles.data?.[0]?.id ?? "", defaultLocationId: null, active: true } : { email: editingUser.email, name: editingUser.name, password: "", roleId: editingUser.roleId, defaultLocationId: editingUser.defaultLocationId, active: editingUser.active }); }, [editingUser, uf, roles.data]);
  React.useEffect(() => { if (editingRole) rf.reset(editingRole === "new" ? { name: "", permissions: [] } : { name: editingRole.name, permissions: editingRole.permissions }); }, [editingRole, rf]);

  const saveUser = uf.handleSubmit(async (v) => {
    try {
      const body = { ...v, password: v.password || undefined };
      if (editingUser === "new") { if (!body.password) { uf.setError("password", { message: "Introduce una contraseña para el nuevo usuario." }); return; } await api.post(v1("/users"), body); } else if (editingUser) await api.patch(v1(`/users/${editingUser.id}`), body);
      toast.success("Usuario guardado"); await invalidate("users"); setEditingUser(null);
    } catch (err) { if (err instanceof ApiError) { Object.entries(err.fieldErrors()).forEach(([k, m]) => uf.setError(k as keyof UserForm, { message: m })); toast.error(err.message); } }
  });
  const saveRole = rf.handleSubmit(async (v) => {
    try { if (editingRole === "new") await api.post(v1("/roles"), v); else if (editingRole) await api.patch(v1(`/roles/${editingRole.id}`), v); toast.success("Rol guardado"); await invalidate("roles", "me"); setEditingRole(null); }
    catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo guardar"); }
  });
  const deactivate = async (u: AppUser) => { if (!(await confirm({ title: `¿Desactivar a ${u.name}?`, description: "No podrá iniciar sesión y se cerrarán sus sesiones activas.", confirmLabel: "Desactivar", destructive: true }))) return; try { await api.delete(v1(`/users/${u.id}`)); await invalidate("users"); toast.success("Usuario desactivado"); } catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo"); } };
  const deleteRole = async (r: Role) => { if (!(await confirm({ title: `¿Eliminar rol ${r.name}?`, confirmLabel: "Eliminar", destructive: true }))) return; try { await api.delete(v1(`/roles/${r.id}`)); await invalidate("roles"); toast.success("Rol eliminado"); } catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo eliminar"); } };

  return (
    <div className="flex flex-col gap-4">
      <Card title="Usuarios" padded={false} actions={<Button variant="primary" size="sm" onClick={() => setEditingUser("new")}>Agregar usuario</Button>}>
        <ul className="divide-y divide-border">
          {(users.data ?? []).map((u) => <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"><div className="min-w-0"><div className="flex items-center gap-2"><span className="font-medium">{u.name}</span>{u.id === me?.id ? <Badge tone="info">Tú</Badge> : null}<ActiveBadge active={u.active} /></div><div className="truncate text-sm text-muted-foreground">{u.email} · {u.role.name} · último acceso <DateText value={u.lastLoginAt} /></div></div><div className="flex shrink-0 gap-1"><Button variant="secondary" size="sm" onClick={() => setEditingUser(u)}>Editar</Button>{u.id !== me?.id && u.active ? <Button variant="ghost" size="sm" onClick={() => deactivate(u)}>Desactivar</Button> : null}</div></li>)}
        </ul>
      </Card>
      <Card title="Roles y permisos" description="Los roles del sistema (ADMIN, INVENTARIO, VENDEDOR) se pueden ajustar, salvo ADMIN." padded={false} actions={<Button variant="secondary" size="sm" onClick={() => setEditingRole("new")}>Crear rol</Button>}>
        <ul className="divide-y divide-border">
          {(roles.data ?? []).map((r) => <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"><div><div className="flex items-center gap-2"><span className="font-medium">{r.name}</span>{r.isSystem ? <Badge tone="outline">Sistema</Badge> : null}</div><div className="text-sm text-muted-foreground">{r.permissions.length} permisos</div></div><div className="flex gap-1"><Button variant="secondary" size="sm" onClick={() => setEditingRole(r)} disabled={r.name === "ADMIN"}>{r.name === "ADMIN" ? "Todos los permisos" : "Editar"}</Button>{!r.isSystem ? <Button variant="ghost" size="sm" onClick={() => deleteRole(r)}>Eliminar</Button> : null}</div></li>)}
        </ul>
      </Card>

      <Dialog open={!!editingUser} onOpenChange={(o) => !o && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingUser === "new" ? "Nuevo usuario" : "Editar usuario"}</DialogTitle></DialogHeader>
          <form onSubmit={saveUser} noValidate>
            <DialogBody className="space-y-4">
              <FormRow><TextField control={uf.control} name="name" label="Nombre" required /><TextField control={uf.control} name="email" label="Correo" required inputProps={{ type: "email" }} /></FormRow>
              <FormRow><TextField control={uf.control} name="password" label={editingUser === "new" ? "Contraseña" : "Nueva contraseña (opcional)"} inputProps={{ type: "password", autoComplete: "new-password" }} /><SelectField control={uf.control} name="roleId" label="Rol" required options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))} /></FormRow>
              <SelectField control={uf.control} name="defaultLocationId" label="Ubicación predeterminada" options={(locations.data ?? []).map((l) => ({ value: l.id, label: l.name }))} allowEmpty emptyLabel="Ninguna" />
              {editingUser !== "new" && editingUser?.id !== me?.id ? <Controller control={uf.control} name="active" render={({ field }) => <Field label="Activo" inline><Switch checked={!!field.value} onCheckedChange={field.onChange} /></Field>} /> : null}
            </DialogBody>
            <DialogFooter><Button type="button" variant="secondary" onClick={() => setEditingUser(null)}>Cancelar</Button><Button type="submit" variant="primary" loading={uf.formState.isSubmitting}>Guardar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!editingRole} onOpenChange={(o) => !o && setEditingRole(null)}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>{editingRole === "new" ? "Nuevo rol" : `Permisos de ${typeof editingRole === "object" && editingRole ? editingRole.name : ""}`}</DialogTitle></DialogHeader>
          <form onSubmit={saveRole} noValidate>
            <DialogBody className="space-y-4">
              <TextField control={rf.control} name="name" label="Nombre del rol" required inputProps={{ disabled: editingRole !== null && editingRole !== "new" && editingRole.isSystem }} />
              <Controller control={rf.control} name="permissions" render={({ field, fieldState }) => <Field label="Permisos" error={fieldState.error?.message}><div className="grid gap-2 sm:grid-cols-2">{PERMISSIONS.map((p) => <label key={p} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-base hover:bg-surface-hover"><Checkbox checked={field.value.includes(p)} onCheckedChange={(v) => field.onChange(v ? [...field.value, p] : field.value.filter((x) => x !== p))} /><span className="flex-1">{permissionLabels[p]}</span><span className="text-xs text-muted-foreground tabular">{p}</span></label>)}</div></Field>} />
            </DialogBody>
            <DialogFooter><Button type="button" variant="secondary" onClick={() => setEditingRole(null)}>Cancelar</Button><Button type="submit" variant="primary" loading={rf.formState.isSubmitting}>Guardar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {dialog}
    </div>
  );
}
