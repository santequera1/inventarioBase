import * as React from "react";
import { Bookmark, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { api, v1 } from "@/lib/api";
import { useSavedViews, type SavedView } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export type ViewTab = { id: string; label: string; count?: number; filters: Record<string, string> };

/**
 * Cabecera de una tabla índice: pestañas (vistas), buscador y filtros en UNA sola superficie.
 */
export function IndexTableHeader({
  resource,
  tabs,
  activeTab,
  onTabChange,
  search,
  onSearchChange,
  searchPlaceholder = "Buscar",
  filters,
  activeFilterChips,
  onClearFilters,
  currentFilters,
  trailing,
}: {
  resource: string;
  tabs: ViewTab[];
  activeTab: string;
  onTabChange: (tab: ViewTab) => void;
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  activeFilterChips?: { label: string; onRemove: () => void }[];
  onClearFilters?: () => void;
  /** Filtros actuales para guardar como vista. */
  currentFilters?: Record<string, string>;
  trailing?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const saved = useSavedViews(resource);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const allTabs: ViewTab[] = [...tabs, ...(saved.data ?? []).map((v: SavedView) => ({ id: `saved:${v.id}`, label: v.name, filters: v.filters as Record<string, string> }))];
  const hasFilters = (activeFilterChips?.length ?? 0) > 0;

  const saveView = async () => {
    if (!name.trim()) return;
    try {
      const v = await api.post<SavedView>(v1("/saved-views"), { resource, name: name.trim(), filters: currentFilters ?? {} });
      await qc.invalidateQueries({ queryKey: ["saved-views", resource] });
      setSaveOpen(false);
      setName("");
      onTabChange({ id: `saved:${v.id}`, label: v.name, filters: v.filters as Record<string, string> });
      toast.success(`Vista "${v.name}" guardada`);
    } catch {
      toast.error("No se pudo guardar la vista");
    }
  };
  const deleteView = async (id: string) => {
    await api.delete(v1(`/saved-views/${id}`));
    await qc.invalidateQueries({ queryKey: ["saved-views", resource] });
    if (activeTab === `saved:${id}`) onTabChange(tabs[0]!);
    toast.success("Vista eliminada");
  };

  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-1 overflow-x-auto px-2 pt-2 scrollbar-thin">
        {allTabs.map((t) => {
          const active = t.id === activeTab;
          const isSaved = t.id.startsWith("saved:");
          return (
            <div key={t.id} className="group relative flex shrink-0 items-center">
              <button type="button" onClick={() => onTabChange(t)} className={cn("flex h-8 items-center gap-1.5 rounded-md px-3 text-base font-medium transition-colors", active ? "bg-surface-selected text-foreground" : "text-muted-foreground hover:bg-black/5 hover:text-foreground")} aria-current={active ? "page" : undefined}>
                <span className="whitespace-nowrap">{t.label}</span>
                {t.count !== undefined ? <span className={cn("tabular text-xs", active ? "text-muted-foreground" : "text-muted-foreground/80")}>{t.count.toLocaleString("es-CO")}</span> : null}
              </button>
              {isSaved && active ? (
                <button type="button" aria-label="Eliminar vista" onClick={() => deleteView(t.id.replace("saved:", ""))} className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-black/5 hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}
        {currentFilters && hasFilters ? (
          <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
            <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={() => setSaveOpen(true)}>
              <Plus /> Guardar vista
            </Button>
            <DialogContent size="sm">
              <DialogHeader>
                <DialogTitle>Guardar vista</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <Label htmlFor="view-name">Nombre de la vista</Label>
                <Input id="view-name" className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Stock bajo en bodega" autoFocus onKeyDown={(e) => e.key === "Enter" && saveView()} />
                <p className="mt-1.5 text-sm text-muted-foreground">Se guardarán los filtros y la búsqueda actuales como una pestaña.</p>
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setSaveOpen(false)}>Cancelar</Button>
                <Button variant="primary" onClick={saveView} disabled={!name.trim()}>
                  <Bookmark /> Guardar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
        <Input prefix={<Search />} placeholder={searchPlaceholder} value={search} onChange={(e) => onSearchChange(e.target.value)} className="sm:max-w-sm" aria-label={searchPlaceholder} />
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {filters ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="secondary">
                  <SlidersHorizontal /> Filtros
                  {hasFilters ? <span className="ml-0.5 rounded-full bg-foreground px-1.5 text-xs text-white tabular">{activeFilterChips!.length}</span> : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 space-y-4 p-4">
                {filters}
                {hasFilters && onClearFilters ? (
                  <Button variant="plain" size="sm" onClick={onClearFilters}>
                    Limpiar todos los filtros
                  </Button>
                ) : null}
              </PopoverContent>
            </Popover>
          ) : null}
          {activeFilterChips?.map((c, i) => (
            <span key={i} className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-muted pl-2.5 pr-1 text-sm">
              {c.label}
              <button type="button" onClick={c.onRemove} className="rounded p-0.5 text-muted-foreground hover:bg-black/10 hover:text-foreground" aria-label={`Quitar filtro ${c.label}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          <div className="ml-auto flex items-center gap-2">{trailing}</div>
        </div>
      </div>
    </div>
  );
}

export function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
