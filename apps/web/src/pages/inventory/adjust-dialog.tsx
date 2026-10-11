import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/app/form";
import { LocationSelect } from "@/components/app/pickers";
import { ProductCell } from "@/components/app/product-cell";
import { Qty } from "@/components/app/format";
import { api, ApiError, v1 } from "@/lib/api";
import { useDebounce } from "@/lib/hooks";
import { useInvalidate, useReasons, type InventoryLevel } from "@/lib/queries";
import { newIdempotencyKey, cn } from "@/lib/utils";

type VariantHit = { id: string; sku: string; title: string; available: number | null; product: { id: string; title: string; thumbUrl: string | null } };

export type AdjustTarget = { variantId: string; locationId: string; productTitle: string; variantTitle: string; sku: string; thumbUrl: string | null };

/**
 * Diálogo de ajuste: distingue explícitamente "Agregar o quitar unidades" de "Establecer cantidad final"
 * y muestra la vista previa "Disponible: 24 → 19" antes de guardar. Motivo obligatorio.
 */
export function AdjustDialog({ open, onOpenChange, target, defaultLocationId, onDone, mode: initialKind = "adjust" }: { open: boolean; onOpenChange: (o: boolean) => void; target?: AdjustTarget | null; defaultLocationId?: string; onDone?: () => void; mode?: "adjust" | "state" }) {
  const [kind, setKind] = React.useState<"adjust" | "state">(initialKind);
  const [picked, setPicked] = React.useState<AdjustTarget | null>(target ?? null);
  const [locationId, setLocationId] = React.useState(target?.locationId ?? defaultLocationId ?? "");
  const [mode, setMode] = React.useState<"delta" | "set">("delta");
  const [bucket, setBucket] = React.useState<"AVAILABLE" | "UNAVAILABLE">("AVAILABLE");
  const [qty, setQty] = React.useState<string>("");
  const [stateDir, setStateDir] = React.useState<"to_unavailable" | "to_available">("to_unavailable");
  const [reasonId, setReasonId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const dq = useDebounce(search, 250);
  const invalidate = useInvalidate();
  const reasons = useReasons(kind === "state" ? (stateDir === "to_unavailable" ? "UNAVAILABLE" : "ADJUSTMENT") : "ADJUSTMENT");

  React.useEffect(() => {
    if (open) {
      setKind(initialKind);
      setPicked(target ?? null);
      setLocationId(target?.locationId ?? defaultLocationId ?? "");
      setMode("delta");
      setBucket("AVAILABLE");
      setQty("");
      setReasonId("");
      setNote("");
      setSearch("");
      setError(null);
    }
  }, [open, target, defaultLocationId, initialKind]);

  const hits = useQuery({ queryKey: ["variant-search", dq, locationId], queryFn: () => api.get<{ data: VariantHit[] }>(v1("/variants"), { q: dq, limit: 8, location_id: locationId || undefined, active_only: "false" }), enabled: open && !picked && dq.trim().length >= 1 });
  const level = useQuery({ queryKey: ["level", picked?.variantId, locationId], queryFn: () => api.get<InventoryLevel>(v1(`/inventory-levels/${picked!.variantId}/${locationId}`)), enabled: !!picked && !!locationId });

  const n = qty === "" || qty === "-" ? null : Number(qty);
  const validQty = n !== null && Number.isInteger(n) && (kind === "state" ? n > 0 : mode === "set" ? n >= 0 : n !== 0);
  const lv = level.data;
  const field = bucket === "AVAILABLE" ? "available" : "unavailable";
  const before = lv ? lv[field] : 0;
  let after = before;
  if (kind === "adjust" && n !== null) after = mode === "set" ? n : before + n;
  const onHandBefore = lv ? lv.onHand : 0;
  const onHandAfter = kind === "adjust" ? onHandBefore + (after - before) : onHandBefore;
  const stateFrom = stateDir === "to_unavailable" ? "available" : "unavailable";
  const stateTo = stateDir === "to_unavailable" ? "unavailable" : "available";
  const canSubmit = !!picked && !!locationId && validQty && !!reasonId && !saving && (kind === "adjust" ? after >= 0 || bucket === "AVAILABLE" : (lv?.[stateFrom] ?? 0) >= (n ?? 0));

  const submit = async () => {
    if (!picked || !canSubmit || n === null) return;
    setSaving(true);
    setError(null);
    try {
      if (kind === "adjust") {
        await api.post(v1("/inventory-adjustments"), { variantId: picked.variantId, locationId, mode, bucket, quantity: n, reasonId, note: note || undefined }, newIdempotencyKey());
        toast.success(`Inventario ajustado: ${picked.productTitle}`, { description: `${bucket === "AVAILABLE" ? "Disponible" : "No disponible"}: ${before.toLocaleString("es-CO")} → ${after.toLocaleString("es-CO")}` });
      } else {
        await api.post(v1("/inventory-adjustments/state-change"), { variantId: picked.variantId, locationId, from: stateFrom.toUpperCase(), to: stateTo.toUpperCase(), quantity: n, reasonId, note: note || undefined }, newIdempotencyKey());
        toast.success(`${n.toLocaleString("es-CO")} unidades marcadas como ${stateTo === "unavailable" ? "no disponibles" : "disponibles"}`);
      }
      await invalidate("inventory-levels", "inventory-summary", "level", "movements", "home", "home-movements", "product");
      onDone?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el ajuste.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{kind === "adjust" ? "Ajustar inventario" : "Cambiar estado de unidades"}</DialogTitle>
          <DialogDescription>{kind === "adjust" ? "Cada ajuste queda registrado en el historial con su motivo." : "Mueve unidades entre Disponible y No disponible sin cambiar la existencia total."}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {!target ? (
            <div className="flex gap-1 rounded-md bg-muted p-1">
              {(["adjust", "state"] as const).map((k) => (
                <button key={k} type="button" onClick={() => { setKind(k); setReasonId(""); }} className={cn("h-8 flex-1 rounded-sm text-base font-medium", kind === k ? "bg-card shadow-button" : "text-muted-foreground hover:text-foreground")}>
                  {k === "adjust" ? "Ajustar cantidad" : "Cambiar estado"}
                </button>
              ))}
            </div>
          ) : null}

          {/* Producto */}
          <Field label="Producto" required>
            {picked ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5">
                <ProductCell title={picked.productTitle} variantTitle={picked.variantTitle} sku={picked.sku} thumbUrl={picked.thumbUrl} compact />
                {!target ? <Button variant="plain" size="sm" onClick={() => setPicked(null)}>Cambiar</Button> : null}
              </div>
            ) : (
              <div className="relative">
                <Input prefix={<Search />} placeholder="Busca por nombre, SKU o código de barras" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
                {dq.trim() && hits.data ? (
                  <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-popover">
                    {hits.data.data.length === 0 ? <li className="px-2 py-3 text-center text-sm text-muted-foreground">Sin resultados para “{dq}”.</li> : null}
                    {hits.data.data.map((h) => (
                      <li key={h.id}>
                        <button type="button" className="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left hover:bg-surface-hover" onClick={() => { setPicked({ variantId: h.id, locationId, productTitle: h.product.title, variantTitle: h.title, sku: h.sku, thumbUrl: h.product.thumbUrl }); setSearch(""); }}>
                          <ProductCell title={h.product.title} variantTitle={h.title} sku={h.sku} thumbUrl={h.product.thumbUrl} compact />
                          {h.available !== null ? <span className="shrink-0 text-sm text-muted-foreground tabular">{h.available.toLocaleString("es-CO")} disp.</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </Field>

          <Field label="Ubicación" required htmlFor="adj-location">
            <LocationSelect id="adj-location" value={locationId} onChange={setLocationId} className="w-full" />
          </Field>

          {kind === "adjust" ? (
            <>
              <Field label="Tipo de ajuste" required>
                <RadioGroup value={mode} onValueChange={(v) => setMode(v as "delta" | "set")} className="grid gap-2 sm:grid-cols-2">
                  <label className={cn("flex cursor-pointer items-start gap-2.5 rounded-md border p-3", mode === "delta" ? "border-foreground bg-surface-selected/50" : "border-border hover:bg-surface-hover")}>
                    <RadioGroupItem value="delta" className="mt-0.5" />
                    <span>
                      <span className="block font-medium">Agregar o quitar unidades</span>
                      <span className="block text-sm text-muted-foreground">Escribe +10 para sumar o −3 para restar.</span>
                    </span>
                  </label>
                  <label className={cn("flex cursor-pointer items-start gap-2.5 rounded-md border p-3", mode === "set" ? "border-foreground bg-surface-selected/50" : "border-border hover:bg-surface-hover")}>
                    <RadioGroupItem value="set" className="mt-0.5" />
                    <span>
                      <span className="block font-medium">Establecer cantidad final</span>
                      <span className="block text-sm text-muted-foreground">El total quedará exactamente en lo que escribas.</span>
                    </span>
                  </label>
                </RadioGroup>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Estado a ajustar" htmlFor="adj-bucket">
                  <Select value={bucket} onValueChange={(v) => setBucket(v as "AVAILABLE")}>
                    <SelectTrigger id="adj-bucket"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AVAILABLE">Disponible</SelectItem>
                      <SelectItem value="UNAVAILABLE">No disponible</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={mode === "delta" ? "Unidades a agregar o quitar" : "Cantidad final"} required htmlFor="adj-qty" error={qty !== "" && !validQty ? (mode === "set" ? "Introduce una cantidad entera igual o mayor que cero." : "Introduce un número entero distinto de cero (usa − para quitar).") : undefined}>
                  <Input id="adj-qty" type="text" inputMode="numeric" className="tabular text-right" placeholder={mode === "delta" ? "+10 o -3" : "0"} value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d-]/g, "").replace(/(?!^)-/g, ""))} />
                </Field>
              </div>
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Movimiento" htmlFor="adj-dir">
                <Select value={stateDir} onValueChange={(v) => { setStateDir(v as "to_unavailable"); setReasonId(""); }}>
                  <SelectTrigger id="adj-dir"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="to_unavailable">Disponible → No disponible</SelectItem>
                    <SelectItem value="to_available">No disponible → Disponible</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Unidades" required htmlFor="adj-qty" error={qty !== "" && !validQty ? "Introduce una cantidad entera mayor que cero." : lv && n !== null && n > (lv[stateFrom] ?? 0) ? `Solo hay ${lv[stateFrom].toLocaleString("es-CO")} unidades en ${stateFrom === "available" ? "Disponible" : "No disponible"}.` : undefined}>
                <Input id="adj-qty" type="text" inputMode="numeric" className="tabular text-right" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} />
              </Field>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Motivo" required htmlFor="adj-reason">
              <Select value={reasonId} onValueChange={setReasonId}>
                <SelectTrigger id="adj-reason"><SelectValue placeholder="Selecciona un motivo" /></SelectTrigger>
                <SelectContent>
                  {(reasons.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Nota (opcional)" htmlFor="adj-note">
              <Textarea id="adj-note" rows={1} className="min-h-9" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Detalle adicional" />
            </Field>
          </div>

          {/* Vista previa */}
          {picked && locationId ? (
            <div className="rounded-md border border-border bg-muted/60 p-3">
              <div className="mb-2 text-sm font-medium text-muted-foreground">Vista previa del cambio</div>
              {kind === "adjust" ? (
                <div className="space-y-1.5 text-base">
                  <PreviewRow label={bucket === "AVAILABLE" ? "Disponible" : "No disponible"} before={before} after={validQty ? after : null} />
                  <PreviewRow label="En existencia" before={onHandBefore} after={validQty ? onHandAfter : null} muted />
                  {validQty && after < 0 ? <p className="text-sm text-destructive">El resultado sería negativo. Solo se permite si la política de stock negativo está activa.</p> : null}
                </div>
              ) : (
                <div className="space-y-1.5 text-base">
                  <PreviewRow label="Disponible" before={lv?.available ?? 0} after={validQty ? (lv?.available ?? 0) + (stateDir === "to_unavailable" ? -(n ?? 0) : n ?? 0) : null} />
                  <PreviewRow label="No disponible" before={lv?.unavailable ?? 0} after={validQty ? (lv?.unavailable ?? 0) + (stateDir === "to_unavailable" ? n ?? 0 : -(n ?? 0)) : null} />
                  <PreviewRow label="En existencia" before={onHandBefore} after={validQty ? onHandBefore : null} muted />
                </div>
              )}
            </div>
          ) : null}
          {error ? <p className="rounded-md bg-tone-critical-bg px-3 py-2 text-sm text-tone-critical-fg" role="alert">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit} loading={saving}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewRow({ label, before, after, muted }: { label: string; before: number; after: number | null; muted?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between", muted && "text-muted-foreground")}>
      <span>{label}</span>
      <span className="flex items-center gap-2 tabular">
        <Qty value={before} />
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        {after === null ? <span className="text-muted-foreground">—</span> : <span className={cn("font-semibold", after !== before && !muted && "text-foreground")}>{after.toLocaleString("es-CO")}</span>}
      </span>
    </div>
  );
}
