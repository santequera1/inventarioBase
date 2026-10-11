import * as React from "react";
import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import { Page, PageHeader } from "@/components/app/page";
import { cn } from "@/lib/utils";
import StoreSettings from "./store";
import LocationsSettings from "./locations";
import PaymentsSettings from "./payments";
import ReasonsSettings from "./reasons";
import UsersSettings from "./users";
import ApiKeysSettings from "./api-keys";
import WebhooksSettings from "./webhooks";
import AuditSettings from "./audit";
import ImportPage from "./import";

const SECTIONS = [
  { to: "tienda", label: "Tienda e impuestos" },
  { to: "ubicaciones", label: "Ubicaciones" },
  { to: "pagos", label: "Métodos de pago" },
  { to: "motivos", label: "Motivos de ajuste" },
  { to: "usuarios", label: "Usuarios y roles" },
  { to: "api-keys", label: "API keys" },
  { to: "webhooks", label: "Webhooks" },
  { to: "importar", label: "Importar CSV" },
  { to: "auditoria", label: "Auditoría" },
];

export default function SettingsPage() {
  return (
    <Page width="wide">
      <PageHeader title="Configuración" />
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col scrollbar-thin" aria-label="Secciones de configuración">
          {SECTIONS.map((s) => <NavLink key={s.to} to={s.to} className={({ isActive }) => cn("flex h-8 shrink-0 items-center rounded-md px-2.5 text-base font-medium whitespace-nowrap", isActive ? "bg-card text-foreground shadow-nav-active" : "text-[#4a4a4a] hover:bg-black/[0.04]")}>{s.label}</NavLink>)}
        </nav>
        <div className="min-w-0">
          <Routes>
            <Route index element={<Navigate to="tienda" replace />} />
            <Route path="tienda" element={<StoreSettings />} />
            <Route path="ubicaciones" element={<LocationsSettings />} />
            <Route path="pagos" element={<PaymentsSettings />} />
            <Route path="motivos" element={<ReasonsSettings />} />
            <Route path="usuarios" element={<UsersSettings />} />
            <Route path="api-keys" element={<ApiKeysSettings />} />
            <Route path="webhooks" element={<WebhooksSettings />} />
            <Route path="importar" element={<ImportPage />} />
            <Route path="auditoria" element={<AuditSettings />} />
          </Routes>
        </div>
      </div>
    </Page>
  );
}
