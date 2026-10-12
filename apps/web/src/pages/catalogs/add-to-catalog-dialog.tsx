import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { api, ApiError, v1 } from "@/lib/api";
import { useCatalogs, useInvalidate } from "@/lib/queries";

/** Agrega productos seleccionados (desde la lista de productos) a un catálogo existente. */
export function AddToCatalogDialog({ productIds, open, onOpenChange, onDone }: { productIds: string[]; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const catalogs = useCatalogs();
  const invalidate = useInvalidate();
  const [catalogId, setCatalogId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const list = (catalogs.data ?? []).filter((c) => !c.allProducts);

  React.useEffect(() => {
    if (open) setCatalogId(list[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, catalogs.data]);

  const submit = async () => {
    setSaving(true);
    try {
      await api.post(v1(`/catalogs/${catalogId}/products`), { productIds });
      await invalidate("catalogs");
      toast.success(`${productIds.length} producto(s) agregados al catálogo`);
      onDone();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo agregar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Agregar a catálogo</DialogTitle></DialogHeader>
        <DialogBody>
          {catalogs.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando catálogos…</p>
          ) : !list.length ? (
            <p className="text-sm text-muted-foreground">
              No tienes catálogos con selección manual de productos. <Link to="/catalogos/nuevo" className="text-[#005BD3] underline">Crea uno</Link>.
            </p>
          ) : (
            <RadioGroup value={catalogId} onValueChange={setCatalogId} className="space-y-2">
              {list.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-surface-hover">
                  <RadioGroupItem value={c.id} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block text-sm text-muted-foreground">{c.productCount} productos</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" disabled={!catalogId} loading={saving} onClick={submit}>Agregar {productIds.length}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
