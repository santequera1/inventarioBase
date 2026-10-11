import * as React from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { Page, PageHeader } from "@/components/app/page";
import { DataTable, useCursorPagination } from "@/components/app/data-table";
import { IndexTableHeader } from "@/components/app/index-table";
import { DateText, Money, Qty } from "@/components/app/format";
import { EmptyState, ErrorState, NoResults } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { api, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounce, useUrlState } from "@/lib/hooks";
import { usePage, type Customer } from "@/lib/queries";
import { downloadBlob } from "@/lib/utils";
import { CustomerFormDialog } from "./customer-form";

export default function CustomersListPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [url, setUrl] = useUrlState({ q: "", sort: "updated_at:desc" });
  const dq = useDebounce(url.q);
  const pag = useCursorPagination(JSON.stringify([dq, url.sort]));
  const customers = usePage<Customer>("customers", "/customers", { q: dq || undefined, sort: url.sort, limit: 50, cursor: pag.cursor });
  const [open, setOpen] = React.useState(false);
  const sorting: SortingState = React.useMemo(() => { const [id, dir] = url.sort.split(":"); return [{ id: id!, desc: dir === "desc" }]; }, [url.sort]);
  const columns = React.useMemo<ColumnDef<Customer, unknown>[]>(() => [
    { id: "name", header: "Cliente", enableSorting: true, cell: ({ row }) => <div><div className="font-medium">{row.original.firstName} {row.original.lastName}</div><div className="text-sm text-muted-foreground">{row.original.companyName ?? row.original.email ?? row.original.phone ?? ""}</div></div> },
    { id: "document", header: "Documento", cell: ({ row }) => <span className="tabular text-muted-foreground">{row.original.documentType ? `${row.original.documentType} ` : ""}{row.original.documentNumber ?? "—"}</span>, meta: { className: "hidden md:table-cell" } },
    { id: "phone", header: "Teléfono", cell: ({ row }) => <span className="tabular text-muted-foreground">{row.original.phone ?? "—"}</span>, meta: { className: "hidden lg:table-cell" } },
    { id: "city", header: "Ciudad", cell: ({ row }) => <span className="text-muted-foreground">{row.original.city ?? "—"}</span>, meta: { className: "hidden xl:table-cell" } },
    { id: "last_order_at", header: "Última compra", enableSorting: true, cell: ({ row }) => <DateText value={row.original.lastOrderAt} className="text-muted-foreground" />, meta: { className: "hidden md:table-cell" } },
    { id: "orders_count", header: "Órdenes", enableSorting: true, cell: ({ row }) => <Qty value={row.original.ordersCount} />, meta: { numeric: true } },
    { id: "total_spent", header: "Total gastado", enableSorting: true, cell: ({ row }) => <Money value={row.original.totalSpent} className="font-medium" />, meta: { numeric: true } },
  ], []);
  return (
    <Page width="wide">
      <PageHeader title="Clientes" primaryAction={can("customers.write") ? <Button variant="primary" onClick={() => setOpen(true)}>Agregar cliente</Button> : undefined} secondaryActions={<><Button variant="secondary" onClick={async () => { try { downloadBlob(await api.blob(v1("/exports/customers")), "clientes.csv"); } catch { toast.error("No se pudo exportar"); } }}><Download /> Exportar</Button>{can("import.run") ? <Button variant="secondary" onClick={() => navigate("/configuracion/importar?kind=customers")}><Upload /> Importar</Button> : null}</>} />
      <div className="surface overflow-hidden">
        <IndexTableHeader resource="customers" tabs={[{ id: "all", label: "Todos", count: customers.data?.meta.total, filters: {} }]} activeTab="all" onTabChange={() => undefined} search={url.q} onSearchChange={(q) => setUrl({ q })} searchPlaceholder="Buscar por nombre, documento, teléfono o correo" />
        {customers.isError ? <ErrorState error={customers.error} onRetry={() => customers.refetch()} /> : <DataTable columns={columns} data={customers.data?.data ?? []} loading={customers.isLoading || customers.isFetching} getRowId={(r) => r.id} onRowClick={(r) => navigate(`/clientes/${r.id}`)} sorting={sorting} onSortingChange={(u) => { const n = typeof u === "function" ? u(sorting) : u; const s = n[0]; if (s) setUrl({ sort: `${s.id}:${s.desc ? "desc" : "asc"}` }); }} pagination={{ hasMore: customers.data?.meta.has_more ?? false, onNext: () => pag.next(customers.data?.meta.next_cursor ?? null), onPrev: pag.prev, canPrev: pag.canPrev, total: customers.data?.meta.total, shown: customers.data?.data.length ?? 0 }} empty={dq ? <NoResults onClear={() => setUrl({ q: "" })} /> : <EmptyState title="Sin clientes" description="Registra clientes para asociarlos a las ventas y ver su historial y total gastado." action={can("customers.write") ? <Button variant="primary" onClick={() => setOpen(true)}>Agregar cliente</Button> : undefined} />} />}
      </div>
      <CustomerFormDialog open={open} onOpenChange={setOpen} onSaved={(c) => navigate(`/clientes/${c.id}`)} />
    </Page>
  );
}
