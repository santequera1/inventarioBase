import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ProductCell } from "@/components/app/product-cell";
import { api, v1 } from "@/lib/api";
import { useDebounce } from "@/lib/hooks";
import { Money } from "./format";

export type VariantHit = { id: string; sku: string; barcode: string | null; title: string; price: number; cost: number | null; available: number | null; product: { id: string; title: string; taxRate: number; thumbUrl: string | null } };

/** Buscador de variantes con lista desplegable. `locationId` muestra disponible en esa ubicación. */
export function VariantPicker({ onPick, locationId, placeholder = "Buscar producto por nombre, SKU o código de barras", autoFocus, activeOnly = true, inputRef, showPrice }: { onPick: (v: VariantHit) => void; locationId?: string; placeholder?: string; autoFocus?: boolean; activeOnly?: boolean; inputRef?: React.RefObject<HTMLInputElement>; showPrice?: boolean }) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [idx, setIdx] = React.useState(0);
  const dq = useDebounce(q, 200);
  const hits = useQuery({ queryKey: ["variant-search", dq, locationId, activeOnly], queryFn: () => api.get<{ data: VariantHit[] }>(v1("/variants"), { q: dq, limit: 10, location_id: locationId || undefined, active_only: activeOnly ? "true" : "false" }), enabled: dq.trim().length >= 1 });
  const list = hits.data?.data ?? [];

  React.useEffect(() => setIdx(0), [dq]);

  const pick = (v: VariantHit) => {
    onPick(v);
    setQ("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        prefix={<Search />}
        placeholder={placeholder}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, list.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter") {
            e.preventDefault();
            // Lector de código de barras: coincidencia exacta inmediata.
            const exact = list.find((v) => v.barcode === q.trim() || v.sku.toLowerCase() === q.trim().toLowerCase());
            if (exact) pick(exact);
            else if (list[idx]) pick(list[idx]!);
          } else if (e.key === "Escape") setOpen(false);
        }}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open && dq.trim() ? (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-popover" role="listbox">
          {hits.isLoading ? <li className="px-2 py-3 text-center text-sm text-muted-foreground">Buscando…</li> : null}
          {!hits.isLoading && list.length === 0 ? <li className="px-2 py-3 text-center text-sm text-muted-foreground">Sin resultados para “{dq}”.</li> : null}
          {list.map((v, i) => (
            <li key={v.id} role="option" aria-selected={i === idx}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(v)} onMouseEnter={() => setIdx(i)} className={`flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left ${i === idx ? "bg-surface-hover" : ""}`}>
                <ProductCell title={v.product.title} variantTitle={v.title} sku={v.sku} thumbUrl={v.product.thumbUrl} compact />
                <span className="shrink-0 text-right text-sm">
                  {showPrice ? <div className="font-medium"><Money value={v.price} /></div> : null}
                  {v.available !== null ? <div className={`tabular ${v.available <= 0 ? "text-destructive" : "text-muted-foreground"}`}>{v.available.toLocaleString("es-CO")} disp.</div> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
