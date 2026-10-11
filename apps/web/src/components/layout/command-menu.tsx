import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Package, Receipt, Users } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { api, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounce } from "@/lib/hooks";
import { NAV } from "./nav";
import type { Customer, Order, Page, Product } from "@/lib/queries";

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [q, setQ] = React.useState("");
  const dq = useDebounce(q, 200);
  const enabled = open && dq.trim().length >= 2;

  const products = useQuery({ queryKey: ["cmd-products", dq], queryFn: () => api.get<Page<Product>>(v1("/products"), { q: dq, limit: 5 }), enabled: enabled && can("products.read") });
  const orders = useQuery({ queryKey: ["cmd-orders", dq], queryFn: () => api.get<Page<Order>>(v1("/orders"), { q: dq, limit: 5 }), enabled: enabled && can("orders.read") });
  const customers = useQuery({ queryKey: ["cmd-customers", dq], queryFn: () => api.get<Page<Customer>>(v1("/customers"), { q: dq, limit: 5 }), enabled: enabled && can("customers.read") });

  const go = (to: string) => {
    onOpenChange(false);
    setQ("");
    navigate(to);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar productos, SKU, órdenes, clientes o ir a…" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>{enabled ? "Sin resultados." : "Escribe al menos 2 caracteres para buscar."}</CommandEmpty>
        {products.data?.data.length ? (
          <CommandGroup heading="Productos">
            {products.data.data.map((p) => (
              <CommandItem key={p.id} value={`p-${p.id} ${p.title} ${p.variants.map((v) => v.sku).join(" ")}`} onSelect={() => go(`/productos/${p.id}`)}>
                <Package />
                <span className="truncate">{p.title}</span>
                <span className="ml-auto text-xs text-muted-foreground tabular">{p.variants.length === 1 ? p.variants[0]!.sku : `${p.variants.length} variantes`}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {orders.data?.data.length ? (
          <CommandGroup heading="Órdenes">
            {orders.data.data.map((o) => (
              <CommandItem key={o.id} value={`o-${o.id} ${o.number}`} onSelect={() => go(`/ordenes/${o.id}`)}>
                <Receipt />
                <span>{o.number}</span>
                <span className="ml-2 truncate text-muted-foreground">{o.customer ? `${o.customer.firstName} ${o.customer.lastName ?? ""}` : "Sin cliente"}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {customers.data?.data.length ? (
          <CommandGroup heading="Clientes">
            {customers.data.data.map((c) => (
              <CommandItem key={c.id} value={`c-${c.id} ${c.firstName} ${c.lastName ?? ""} ${c.documentNumber ?? ""}`} onSelect={() => go(`/clientes/${c.id}`)}>
                <Users />
                <span className="truncate">
                  {c.firstName} {c.lastName}
                </span>
                {c.documentNumber ? <span className="ml-auto text-xs text-muted-foreground tabular">{c.documentNumber}</span> : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        <CommandGroup heading="Ir a">
          {NAV.filter((n) => !n.permission || can(n.permission)).map((n) => (
            <CommandItem key={n.to} value={`nav ${n.label}`} onSelect={() => go(n.to)}>
              <n.icon />
              <span>{n.label}</span>
              <CommandShortcut>
                <ArrowRight className="h-3.5 w-3.5" />
              </CommandShortcut>
            </CommandItem>
          ))}
          {can("inventory.adjust") ? (
            <CommandItem value="accion ajustar inventario" onSelect={() => go("/inventario?ajustar=1")}>
              <ArrowRight />
              <span>Ajustar inventario</span>
            </CommandItem>
          ) : null}
          {can("products.write") ? (
            <CommandItem value="accion nuevo producto" onSelect={() => go("/productos/nuevo")}>
              <ArrowRight />
              <span>Nuevo producto</span>
            </CommandItem>
          ) : null}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
