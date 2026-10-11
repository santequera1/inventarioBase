import * as React from "react";
import { Link } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { createSupplierBody } from "@inventario/shared";
import { Page, PageHeader } from "@/components/app/page";
import { DataTable, useCursorPagination } from "@/components/app/data-table";
import { IndexTableHeader } from "@/components/app/index-table";
import { ActiveBadge } from "@/components/app/badges";
import { EmptyState, ErrorState, NoResults } from "@/components/app/states";
import { FormRow, TextField, TextareaField } from "@/components/app/form";
import { useConfirm } from "@/components/app/confirm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { api, ApiError, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounce, useUrlState } from "@/lib/hooks";
import { useInvalidate, usePage, type Supplier } from "@/lib/queries";

type Form = z.infer<typeof createSupplierBody>;
const empty: Form = { name: "", nit: "", contactName: "", email: "", phone: "", address: "", notes: "", active: true };

export default function SuppliersListPage() {
  const { can } = useAuth();
  const invalidate = useInvalidate();
  const { confirm, dialog } = useConfirm();
  const [url, setUrl] = useUrlState({ q: "" });
  const dq = useDebounce(url.q);
  const pag = useCursorPagination(dq);
  const suppliers = usePage<Supplier>("suppliers", "/suppliers", { q: dq || undefined, limit: 50, cursor: pag.cursor });
  const [editing, setEditing] = React.useState<Supplier | null | "new">(null);
  const form = useForm<Form>({ resolver: zodResolver(createSupplierBody), defaultValues: empty });
  React.useEffect(() => { if (editing) form.reset(editing === "new" ? empty : { ...empty, ...editing, email: editing.email ?? "" }); }, [editing, form]);
  const submit = form.handleSubmit(async (v) => {
    try {
      if (editing === "new") await api.post(v1("/suppliers"), v); else if (editing) await api.patch(v1(`/suppliers/${editing.id}`), v);
      toast.success("Proveedor guardado"); await invalidate("suppliers"); setEditing(null);
    } catch (err) { if (err instanceof ApiError) { Object.entries(err.fieldErrors()).forEach(([k, m]) => form.setError(k as keyof Form, { message: m })); toast.error(err.message); } }
  });
  const remove = async (s: Supplier) => {
    if (!(await confirm({ title: `¿Eliminar ${s.name}?`, description: "Si tiene órdenes de compra se desactivará en lugar de eliminarse.", confirmLabel: "Eliminar", destructive: true }))) return;
    try { await api.delete(v1(`/suppliers/${s.id}`)); toast.success("Proveedor eliminado"); await invalidate("suppliers"); } catch { toast.error("No se pudo eliminar"); }
  };
  const columns = React.useMemo<ColumnDef<Supplier, unknown>[]>(() => [
    { id: "name", header: "Proveedor", cell: ({ row }) => <div><div className="font-medium">{row.original.name}</div><div className="text-sm text-muted-foreground">{row.original.nit ? `NIT ${row.original.nit}` : row.original.contactName ?? ""}</div></div> },
    { id: "contact", header: "Contacto", cell: ({ row }) => <span className="text-muted-foreground">{row.original.contactName ?? "—"}</span>, meta: { className: "hidden md:table-cell" } },
    { id: "phone", header: "Teléfono", cell: ({ row }) => <span className="tabular text-muted-foreground">{row.original.phone ?? "—"}</span>, meta: { className: "hidden md:table-cell" } },
    { id: "email", header: "Correo", cell: ({ row }) => <span className="text-muted-foreground">{row.original.email ?? "—"}</span>, meta: { className: "hidden lg:table-cell" } },
    { id: "active", header: "Estado", cell: ({ row }) => <ActiveBadge active={row.original.active} />, meta: { className: "w-[100px]" } },
    { id: "actions", header: "", cell: ({ row }) => can("suppliers.write") ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Acciones" onClick={(e) => e.stopPropagation()}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setEditing(row.original)}>Editar</DropdownMenuItem><DropdownMenuItem asChild><Link to={`/compras?q=${encodeURIComponent(row.original.name)}`}>Ver órdenes de compra</Link></DropdownMenuItem><DropdownMenuItem destructive onSelect={() => remove(row.original)}>Eliminar</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null, meta: { className: "w-10" } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [can]);
  return (
    <Page width="wide">
      <PageHeader title="Proveedores" primaryAction={can("suppliers.write") ? <Button variant="primary" onClick={() => setEditing("new")}>Agregar proveedor</Button> : undefined} secondaryActions={can("purchases.read") ? <Button asChild variant="secondary"><Link to="/compras">Órdenes de compra</Link></Button> : undefined} />
      <div className="surface overflow-hidden">
        <IndexTableHeader resource="suppliers" tabs={[{ id: "all", label: "Todos", count: suppliers.data?.meta.total, filters: {} }]} activeTab="all" onTabChange={() => undefined} search={url.q} onSearchChange={(q) => setUrl({ q })} searchPlaceholder="Buscar por nombre, NIT o contacto" />
        {suppliers.isError ? <ErrorState error={suppliers.error} /> : <DataTable columns={columns} data={suppliers.data?.data ?? []} loading={suppliers.isLoading || suppliers.isFetching} getRowId={(r) => r.id} onRowClick={can("suppliers.write") ? (r) => setEditing(r) : undefined} pagination={{ hasMore: suppliers.data?.meta.has_more ?? false, onNext: () => pag.next(suppliers.data?.meta.next_cursor ?? null), onPrev: pag.prev, canPrev: pag.canPrev, total: suppliers.data?.meta.total, shown: suppliers.data?.data.length ?? 0 }} empty={dq ? <NoResults onClear={() => setUrl({ q: "" })} /> : <EmptyState title="Sin proveedores" description="Registra tus proveedores para asociarlos a productos y órdenes de compra." action={can("suppliers.write") ? <Button variant="primary" onClick={() => setEditing("new")}>Agregar proveedor</Button> : undefined} />} />}
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>{editing === "new" ? "Nuevo proveedor" : "Editar proveedor"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} noValidate>
            <DialogBody className="space-y-4">
              <FormRow><TextField control={form.control} name="name" label="Nombre" required /><TextField control={form.control} name="nit" label="NIT" /></FormRow>
              <FormRow><TextField control={form.control} name="contactName" label="Persona de contacto" /><TextField control={form.control} name="phone" label="Teléfono" /></FormRow>
              <FormRow><TextField control={form.control} name="email" label="Correo" inputProps={{ type: "email" }} /><TextField control={form.control} name="address" label="Dirección" /></FormRow>
              <TextareaField control={form.control} name="notes" label="Notas" rows={2} />
            </DialogBody>
            <DialogFooter><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" variant="primary" loading={form.formState.isSubmitting}>Guardar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {dialog}
    </Page>
  );
}
