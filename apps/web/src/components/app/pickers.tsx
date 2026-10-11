import * as React from "react";
import { MapPin } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocations } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function LocationSelect({ value, onChange, allowAll, className, id, activeOnly = true, exclude }: { value: string; onChange: (v: string) => void; allowAll?: boolean; className?: string; id?: string; activeOnly?: boolean; exclude?: string }) {
  const { data } = useLocations();
  const list = (data ?? []).filter((l) => (!activeOnly || l.active) && l.id !== exclude);
  return (
    <Select value={value || (allowAll ? "__all" : "")} onValueChange={(v) => onChange(v === "__all" ? "" : v)}>
      <SelectTrigger id={id} className={cn("min-w-[180px]", className)} aria-label="Ubicación">
        <span className="flex items-center gap-2 truncate">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="Ubicación" />
        </span>
      </SelectTrigger>
      <SelectContent>
        {allowAll ? <SelectItem value="__all">Todas las ubicaciones</SelectItem> : null}
        {list.map((l) => (
          <SelectItem key={l.id} value={l.id}>
            {l.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SimpleSelect({ value, onChange, options, placeholder, className, id, allLabel }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; className?: string; id?: string; allLabel?: string }) {
  return (
    <Select value={value || "__all"} onValueChange={(v) => onChange(v === "__all" ? "" : v)}>
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{allLabel ?? placeholder ?? "Todos"}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function DateRange({ from, to, onChange, className }: { from: string; to: string; onChange: (v: { from: string; to: string }) => void; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <input type="date" value={from} onChange={(e) => onChange({ from: e.target.value, to })} className="h-9 rounded-md border border-input bg-card px-2.5 text-base tabular" aria-label="Desde" />
      <span className="text-muted-foreground">–</span>
      <input type="date" value={to} onChange={(e) => onChange({ from, to: e.target.value })} className="h-9 rounded-md border border-input bg-card px-2.5 text-base tabular" aria-label="Hasta" />
    </div>
  );
}
