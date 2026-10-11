import { ArrowLeftRight, BarChart3, Boxes, ClipboardList, Code2, Home, Package, Receipt, Settings, ShoppingCart, Truck, Users, type LucideIcon } from "lucide-react";
import type { Permission } from "@inventario/shared";

export type NavItem = { to: string; label: string; icon: LucideIcon; permission?: Permission; end?: boolean };

export const NAV: NavItem[] = [
  { to: "/", label: "Inicio", icon: Home, end: true },
  { to: "/productos", label: "Productos", icon: Package, permission: "products.read" },
  { to: "/inventario", label: "Inventario", icon: Boxes, permission: "inventory.read" },
  { to: "/movimientos", label: "Movimientos", icon: ClipboardList, permission: "inventory.read" },
  { to: "/transferencias", label: "Transferencias", icon: ArrowLeftRight, permission: "inventory.read" },
  { to: "/pos", label: "Ventas / POS", icon: ShoppingCart, permission: "pos.use" },
  { to: "/ordenes", label: "Órdenes", icon: Receipt, permission: "orders.read" },
  { to: "/clientes", label: "Clientes", icon: Users, permission: "customers.read" },
  { to: "/proveedores", label: "Proveedores", icon: Truck, permission: "suppliers.read" },
  { to: "/reportes", label: "Reportes", icon: BarChart3, permission: "reports.read" },
  { to: "/desarrolladores", label: "Desarrolladores", icon: Code2, permission: "apikeys.manage" },
  { to: "/configuracion", label: "Configuración", icon: Settings, permission: "settings.manage" },
];
