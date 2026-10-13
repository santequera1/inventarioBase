import * as React from "react";
import { createBrowserRouter, Navigate, Outlet, useLocation } from "react-router-dom";
import type { Permission } from "@inventario/shared";
import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/lib/auth";
import { PageSkeleton } from "@/components/app/states";
import { Page } from "@/components/app/page";
import { EmptyState } from "@/components/app/states";
import { ShieldAlert } from "lucide-react";

const lazy = (p: () => Promise<{ default: React.ComponentType }>) => {
  const C = React.lazy(p);
  return (
    <React.Suspense
      fallback={
        <Page>
          <PageSkeleton />
        </Page>
      }
    >
      <C />
    </React.Suspense>
  );
};

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <Page>
        <PageSkeleton />
      </Page>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

function RequirePermission({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can(permission)) {
    return (
      <Page>
        <EmptyState icon={<ShieldAlert />} title="Sin permiso" description="Tu rol no tiene acceso a esta sección. Pide a un administrador que lo habilite." />
      </Page>
    );
  }
  return <>{children}</>;
}

const guard = (permission: Permission, el: React.ReactNode) => <RequirePermission permission={permission}>{el}</RequirePermission>;

/**
 * En el dominio corto de catálogos (VITE_CATALOG_BASE_URL) solo existen los catálogos públicos:
 * https://tienda.midominio.com/<slug>. El panel sigue en su dominio normal.
 */
const catalogHost = (() => {
  try {
    const base = import.meta.env.VITE_CATALOG_BASE_URL as string | undefined;
    return base ? new URL(base).host : null;
  } catch {
    return null;
  }
})();
const isCatalogHost = !!catalogHost && window.location.host === catalogHost;

const catalogHostRoutes = [
  { path: "/:slug", element: lazy(() => import("./pages/catalogs/public")) },
  { path: "*", element: lazy(() => import("./pages/catalogs/public")) },
];

export const router = createBrowserRouter(isCatalogHost ? catalogHostRoutes : [
  { path: "/login", element: lazy(() => import("./pages/login")) },
  { path: "/recibo/:id", element: lazy(() => import("./pages/orders/receipt")) },
  { path: "/catalogo/:slug", element: lazy(() => import("./pages/catalogs/public")) },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: lazy(() => import("./pages/home")) },
          { path: "cuenta", element: lazy(() => import("./pages/account")) },
          { path: "productos", element: guard("products.read", lazy(() => import("./pages/products/list"))) },
          { path: "productos/nuevo", element: guard("products.write", lazy(() => import("./pages/products/edit"))) },
          { path: "productos/:id", element: guard("products.read", lazy(() => import("./pages/products/edit"))) },
          { path: "catalogos", element: guard("products.read", lazy(() => import("./pages/catalogs/list"))) },
          { path: "catalogos/nuevo", element: guard("products.write", lazy(() => import("./pages/catalogs/edit"))) },
          { path: "catalogos/:id", element: guard("products.read", lazy(() => import("./pages/catalogs/edit"))) },
          { path: "inventario", element: guard("inventory.read", lazy(() => import("./pages/inventory/list"))) },
          { path: "inventario/:variantId/:locationId", element: guard("inventory.read", lazy(() => import("./pages/inventory/detail"))) },
          { path: "inventario/conteos", element: guard("inventory.read", lazy(() => import("./pages/inventory/counts"))) },
          { path: "inventario/conteos/:id", element: guard("inventory.read", lazy(() => import("./pages/inventory/count-detail"))) },
          { path: "movimientos", element: guard("inventory.read", lazy(() => import("./pages/inventory/movements"))) },
          { path: "transferencias", element: guard("inventory.read", lazy(() => import("./pages/transfers/list"))) },
          { path: "transferencias/nueva", element: guard("inventory.transfer", lazy(() => import("./pages/transfers/new"))) },
          { path: "transferencias/:id", element: guard("inventory.read", lazy(() => import("./pages/transfers/detail"))) },
          { path: "compras", element: guard("purchases.read", lazy(() => import("./pages/purchases/list"))) },
          { path: "compras/nueva", element: guard("purchases.write", lazy(() => import("./pages/purchases/new"))) },
          { path: "compras/:id", element: guard("purchases.read", lazy(() => import("./pages/purchases/detail"))) },
          { path: "pos", element: guard("pos.use", lazy(() => import("./pages/pos/pos"))) },
          { path: "caja", element: guard("cash.manage", lazy(() => import("./pages/pos/cash"))) },
          { path: "ordenes", element: guard("orders.read", lazy(() => import("./pages/orders/list"))) },
          { path: "ordenes/:id", element: guard("orders.read", lazy(() => import("./pages/orders/detail"))) },
          { path: "clientes", element: guard("customers.read", lazy(() => import("./pages/customers/list"))) },
          { path: "clientes/:id", element: guard("customers.read", lazy(() => import("./pages/customers/detail"))) },
          { path: "proveedores", element: guard("suppliers.read", lazy(() => import("./pages/suppliers/list"))) },
          { path: "reportes", element: guard("reports.read", lazy(() => import("./pages/reports"))) },
          { path: "desarrolladores", element: guard("apikeys.manage", lazy(() => import("./pages/developers"))) },
          { path: "configuracion/*", element: guard("settings.manage", lazy(() => import("./pages/settings/index"))) },
          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);
