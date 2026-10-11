import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Page, PageHeader, Card, TwoColumn, KeyValue } from "@/components/app/page";
import { DateText, Money, Qty } from "@/components/app/format";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/app/badges";
import { ErrorState, PageSkeleton, EmptyState } from "@/components/app/states";
import { useConfirm } from "@/components/app/confirm";
import { Button } from "@/components/ui/button";
import { api, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInvalidate, type Customer, type Order } from "@/lib/queries";
import { CustomerFormDialog } from "./customer-form";

export default function CustomerDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const invalidate = useInvalidate();
  const { confirm, dialog } = useConfirm();
  const c = useQuery({ queryKey: ["customer", id], queryFn: () => api.get<Customer>(v1(`/customers/${id}`)) });
  const orders = useQuery({ queryKey: ["customer-orders", id], queryFn: () => api.get<{ data: Order[] }>(v1(`/customers/${id}/orders`), { limit: 50 }), enabled: can("orders.read") });
  const [edit, setEdit] = React.useState(false);
  if (c.isLoading) return <Page><PageSkeleton /></Page>;
  if (c.isError || !c.data) return <Page><ErrorState error={c.error} /></Page>;
  const cu = c.data;
  const remove = async () => {
    if (!(await confirm({ title: "¿Eliminar cliente?", description: "Sus órdenes se conservan sin cliente asociado.", confirmLabel: "Eliminar", destructive: true }))) return;
    try { await api.delete(v1(`/customers/${id}`)); toast.success("Cliente eliminado"); await invalidate("customers"); navigate("/clientes"); } catch { toast.error("No se pudo eliminar"); }
  };
  return (
    <Page>
      <PageHeader backTo="/clientes" title={`${cu.firstName} ${cu.lastName ?? ""}`} subtitle={cu.companyName ?? undefined} primaryAction={can("customers.write") ? <Button variant="primary" onClick={() => setEdit(true)}>Editar</Button> : undefined} secondaryActions={can("customers.write") ? <Button variant="destructive-secondary" onClick={remove}>Eliminar</Button> : undefined} />
      <TwoColumn
        main={
          <Card title="Órdenes" padded={false}>
            {orders.data && orders.data.data.length === 0 ? <EmptyState compact title="Sin órdenes" description="Este cliente todavía no tiene compras." /> : (
              <table className="w-full text-base">
                <thead className="text-sm text-muted-foreground"><tr className="border-b border-border"><th className="px-4 py-2 text-left font-medium sm:px-5">Orden</th><th className="px-3 py-2 text-left font-medium">Fecha</th><th className="hidden px-3 py-2 text-left font-medium sm:table-cell">Estado</th><th className="px-3 py-2 text-right font-medium sm:pr-5">Total</th></tr></thead>
                <tbody className="divide-y divide-border">{(orders.data?.data ?? []).map((o) => <tr key={o.id} className="h-13 cursor-pointer hover:bg-surface-hover" onClick={() => navigate(`/ordenes/${o.id}`)}><td className="px-4 py-2 sm:px-5"><Link to={`/ordenes/${o.id}`} className="font-medium tabular hover:underline">{o.number}</Link></td><td className="px-3 py-2"><DateText value={o.createdAt} time className="text-muted-foreground" /></td><td className="hidden px-3 py-2 sm:table-cell"><span className="flex gap-1"><OrderStatusBadge status={o.status} /><PaymentStatusBadge status={o.paymentStatus} /></span></td><td className="px-3 py-2 text-right sm:pr-5"><Money value={o.total} className="font-medium" /></td></tr>)}</tbody>
              </table>
            )}
          </Card>
        }
        aside={
          <>
            <Card title="Resumen"><KeyValue items={[{ label: "Órdenes", value: <Qty value={cu.ordersCount} />, numeric: true }, { label: "Total gastado", value: <Money value={cu.totalSpent} />, numeric: true }, { label: "Última compra", value: <DateText value={cu.lastOrderAt} /> }, { label: "Cliente desde", value: <DateText value={cu.createdAt} /> }]} /></Card>
            <Card title="Contacto"><KeyValue items={[{ label: "Documento", value: cu.documentNumber ? `${cu.documentType ?? ""} ${cu.documentNumber}` : "—" }, { label: "Correo", value: cu.email ?? "—" }, { label: "Teléfono", value: cu.phone ?? "—" }, { label: "Dirección", value: cu.address ? `${cu.address}${cu.city ? `, ${cu.city}` : ""}` : cu.city ?? "—" }, ...(cu.notes ? [{ label: "Notas", value: cu.notes }] : [])]} /></Card>
          </>
        }
      />
      <CustomerFormDialog open={edit} onOpenChange={setEdit} customer={cu} />
      {dialog}
    </Page>
  );
}
