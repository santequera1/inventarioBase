import * as React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { KeyRound, LogOut, Menu, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { useHotkey, useMediaQuery } from "@/lib/hooks";
import { useSettings } from "@/lib/queries";
import { cn, initials } from "@/lib/utils";
import { Sidebar } from "./sidebar";
import { CommandMenu } from "./command-menu";

export function AppShell() {
  const { user, logout } = useAuth();
  const settings = useSettings();
  const [cmdOpen, setCmdOpen] = React.useState(false);
  const [drawer, setDrawer] = React.useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const location = useLocation();
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  useHotkey("mod+k", React.useCallback(() => setCmdOpen((o) => !o), []));
  React.useEffect(() => setDrawer(false), [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-[#1a1a1a] px-3 text-white sm:px-4">
        {!isDesktop ? (
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setDrawer(true)} aria-label="Abrir menú">
            <Menu />
          </Button>
        ) : null}
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-[#1a1a1a]">
            <svg viewBox="0 0 32 32" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M8 11.5 16 7l8 4.5v9L16 25l-8-4.5z" />
              <path d="M8 11.5 16 16l8-4.5M16 16v9" />
            </svg>
          </span>
          <span className="hidden truncate sm:inline">{settings.data?.name ?? "Inventario Willy"}</span>
        </Link>
        <button type="button" onClick={() => setCmdOpen(true)} className="mx-auto flex h-9 w-full max-w-xl items-center gap-2 rounded-md border border-white/15 bg-white/[0.08] px-3 text-left text-base text-white/70 hover:bg-white/[0.12]" aria-label="Buscar (Ctrl+K)">
          <Search className="h-4 w-4" />
          <span className="flex-1 truncate">Buscar</span>
          <kbd className="hidden rounded border border-white/20 px-1.5 py-0.5 font-sans text-xs text-white/60 sm:inline">{isMac ? "⌘" : "Ctrl"} K</kbd>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex h-9 items-center gap-2 rounded-md px-1.5 hover:bg-white/10 sm:px-2" aria-label="Menú de usuario">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#4a9d7f] text-xs font-semibold">{initials(user?.name ?? "?")}</span>
              <span className="hidden max-w-[140px] truncate text-base font-medium md:inline">{user?.name}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="truncate font-medium text-foreground">{user?.name}</div>
              <div className="truncate text-xs font-normal">{user?.email}</div>
              <div className="mt-1 text-xs font-normal">Rol: {user?.role.name}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/cuenta">
                <KeyRound /> Mi cuenta y contraseña
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logout()}>
              <LogOut /> Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="flex flex-1">
        {isDesktop ? (
          <aside className="sticky top-14 h-[calc(100vh-56px)] w-[240px] shrink-0 overflow-y-auto border-r border-border/60 bg-background">
            <Sidebar />
          </aside>
        ) : null}
        {!isDesktop && drawer ? (
          <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
            <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-background shadow-popover animate-in slide-in-from-left duration-200">
              <div className="flex h-14 items-center justify-between border-b border-border px-4">
                <span className="font-semibold">{settings.data?.name ?? "Inventario Willy"}</span>
                <Button variant="ghost" size="icon-sm" onClick={() => setDrawer(false)} aria-label="Cerrar menú">
                  <X />
                </Button>
              </div>
              <Sidebar onNavigate={() => setDrawer(false)} />
            </aside>
          </div>
        ) : null}
        <main className={cn("min-w-0 flex-1")}>
          <Outlet />
        </main>
      </div>
      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
