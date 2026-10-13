import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Copy, ExternalLink, MessageCircle, RefreshCw, Search, Trash2, X } from "lucide-react";
import { formatCOP, inquiryStatusLabels } from "@inventario/shared";
import { Card, Page, PageHeader } from "@/components/app/page";
import { Field, FormRow } from "@/components/app/form";
import { LocationSelect } from "@/components/app/pickers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductCell, Thumb } from "@/components/app/product-cell";
import { DateText } from "@/components/app/format";
import { ProductStatusBadge } from "@/components/app/badges";
import { useConfirm } from "@/components/app/confirm";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInvalidate, type Catalog, type CatalogInquiry, type Page as ApiPage, type Product } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { catalogUrl, copyCatalogLink, shareCatalogOnWhatsapp } from "./share";

type Form = {
  name: string;
  description: string;
  whatsappPhone: string;
  messageIntro: string;
  logoUrl: string;
  logoInvert: boolean;
  active: boolean;
  allProducts: boolean;
  showStock: boolean;
  hideOutOfStock: boolean;
  locationId: string;
  productIds: string[];
};

const DEFAULT_PHONE = "+57 314 7543024";
const empty: Form = { name: "", description: "", whatsappPhone: DEFAULT_PHONE, messageIntro: "", logoUrl: "", logoInvert: false, active: true, allProducts: false, showStock: false, hideOutOfStock: true, locationId: "", productIds: [] };

function toForm(c: Catalog): Form {
  return {
    name: c.name,
    description: c.description ?? "",
    whatsappPhone: `+${c.whatsappPhone}`,
    messageIntro: c.messageIntro ?? "",
    logoUrl: c.logoUrl ?? "",
    logoInvert: c.logoInvert,
    active: c.active,
    allProducts: c.allProducts,
    showStock: c.showStock,
    hideOutOfStock: c.hideOutOfStock,
    locationId: c.locationId ?? "",
    productIds: c.productIds,
  };
}

/** Carga todos los productos (paginando) para el selector y la lista del catálogo. */
function useAllProducts() {
  return useQuery({
    queryKey: ["products", "all-for-catalog"],
    queryFn: async () => {
      const out: Product[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 20; i++) {
        const page: ApiPage<Product> = await api.get<ApiPage<Product>>(v1("/products"), { limit: 200, sort: "title:asc", cursor });
        out.push(...page.data);
        if (!page.meta.has_more) break;
        cursor = page.meta.next_cursor;
      }
      return out;
    },
    staleTime: 30_000,
  });
}

const priceRange = (p: Product) => {
  const prices = p.variants.filter((v) => v.active).map((v) => v.price);
  if (!prices.length) return "—";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatCOP(min) : `${formatCOP(min)} – ${formatCOP(max)}`;
};

export default function CatalogEditPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { can } = useAuth();
  const canWrite = can("products.write");
  const { confirm, dialog } = useConfirm();

  const catalog = useQuery({ queryKey: ["catalogs", id], queryFn: () => api.get<Catalog>(v1(`/catalogs/${id}`)), enabled: !isNew });
  const products = useAllProducts();
  const productMap = React.useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);

  const [form, setForm] = React.useState<Form>(empty);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const loadedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (catalog.data && loadedRef.current !== catalog.data.updatedAt) {
      loadedRef.current = catalog.data.updatedAt;
      setForm(toForm(catalog.data));
    }
  }, [catalog.data]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setErrors({});
    if (!form.name.trim()) return setErrors({ name: "Introduce el nombre del catálogo" });
    if (!form.allProducts && !form.productIds.length) {
      toast.error("Agrega al menos un producto o activa «Incluir todos los productos activos».");
      return;
    }
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      whatsappPhone: form.whatsappPhone,
      messageIntro: form.messageIntro.trim() || null,
      logoUrl: form.logoUrl.trim() || null,
      logoInvert: form.logoInvert,
      active: form.active,
      allProducts: form.allProducts,
      showStock: form.showStock,
      hideOutOfStock: form.hideOutOfStock,
      locationId: form.locationId || null,
      productIds: form.productIds,
    };
    setSaving(true);
    try {
      if (isNew) {
        const c = await api.post<Catalog>(v1("/catalogs"), body);
        toast.success("Catálogo creado. Ya puedes compartir el enlace.");
        await invalidate("catalogs");
        navigate(`/catalogos/${c.id}`, { replace: true });
      } else {
        await api.patch<Catalog>(v1(`/catalogs/${id}`), body);
        toast.success("Catálogo guardado");
        await invalidate("catalogs");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors());
        toast.error(err.message);
      } else toast.error("No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    if (!(await confirm({ title: "¿Generar un enlace nuevo?", description: "El enlace actual dejará de funcionar. Úsalo si compartiste el catálogo con alguien que ya no debe verlo.", confirmLabel: "Generar enlace nuevo", destructive: true }))) return;
    try {
      await api.post(v1(`/catalogs/${id}/regenerate-link`));
      await invalidate("catalogs");
      toast.success("Enlace nuevo generado");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo generar el enlace");
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: "¿Eliminar este catálogo?", description: "El enlace dejará de funcionar y se borrará el historial de pedidos del catálogo. Los productos no se tocan.", confirmLabel: "Eliminar", destructive: true }))) return;
    try {
      await api.delete(v1(`/catalogs/${id}`));
      await invalidate("catalogs");
      toast.success("Catálogo eliminado");
      navigate("/catalogos");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo eliminar");
    }
  };

  const move = (idx: number, dir: -1 | 1) =>
    setForm((f) => {
      const ids = [...f.productIds];
      const j = idx + dir;
      if (j < 0 || j >= ids.length) return f;
      [ids[idx], ids[j]] = [ids[j]!, ids[idx]!];
      return { ...f, productIds: ids };
    });

  if (!isNew && catalog.isLoading) return <Page><PageSkeleton /></Page>;
  if (!isNew && catalog.isError) return <Page><ErrorState error={catalog.error} onRetry={() => catalog.refetch()} /></Page>;

  const c = catalog.data;
  const selected = form.productIds.map((pid) => productMap.get(pid)).filter((p): p is Product => !!p);
  const hiddenCount = selected.filter((p) => p.status !== "ACTIVE").length;

  return (
    <Page width="narrow">
      <PageHeader
        title={isNew ? "Nuevo catálogo" : c?.name}
        backTo="/catalogos"
        badge={c ? <Badge tone={c.active ? "success" : "neutral"}>{c.active ? "Publicado" : "Oculto"}</Badge> : undefined}
        primaryAction={canWrite ? <Button variant="primary" onClick={save} loading={saving}>{isNew ? "Crear catálogo" : "Guardar"}</Button> : undefined}
      />

      <div className="space-y-4">
        {c ? (
          <Card title="Enlace para compartir" description="Cualquiera con el enlace puede ver el catálogo, armar su carrito y enviarte el pedido por WhatsApp.">
            <div className="space-y-3 pb-4">
              <div className="flex gap-2">
                <Input readOnly value={catalogUrl(c.slug)} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace del catálogo" />
                <Button variant="secondary" onClick={() => copyCatalogLink(c.slug)}><Copy />Copiar</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => shareCatalogOnWhatsapp(c.name, c.slug)}><MessageCircle />Compartir por WhatsApp</Button>
                <Button size="sm" variant="secondary" asChild><a href={catalogUrl(c.slug)} target="_blank" rel="noreferrer"><ExternalLink />Ver catálogo</a></Button>
                {canWrite ? <Button size="sm" variant="ghost" onClick={regenerate}><RefreshCw />Generar enlace nuevo</Button> : null}
              </div>
              <p className="text-sm text-muted-foreground">{c.views} visitas · {c.inquiryCount} pedidos enviados</p>
            </div>
          </Card>
        ) : null}

        <Card title="Datos del catálogo">
          <div className="space-y-4 pb-4">
            <Field label="Nombre" required htmlFor="c-name" error={errors.name} help="Lo ven tus clientes arriba del catálogo.">
              <Input id="c-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ej.: Catálogo de temporada" invalid={!!errors.name} disabled={!canWrite} />
            </Field>
            <Field label="Descripción" htmlFor="c-desc" help="Opcional. Horarios, envíos, formas de pago…">
              <Textarea id="c-desc" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} disabled={!canWrite} />
            </Field>
            <FormRow>
              <Field label="WhatsApp que recibe los pedidos" required htmlFor="c-wa" error={errors.whatsappPhone} help="Número del bot o del vendedor, con indicativo.">
                <Input id="c-wa" inputMode="tel" value={form.whatsappPhone} onChange={(e) => set("whatsappPhone", e.target.value)} invalid={!!errors.whatsappPhone} disabled={!canWrite} />
              </Field>
              <Field label="Stock tomado de" htmlFor="c-loc" help="Por defecto suma las ubicaciones que venden en línea.">
                <LocationSelect id="c-loc" value={form.locationId} onChange={(v) => set("locationId", v)} allowAll className="w-full" />
              </Field>
            </FormRow>
            <Field label="Primera línea del mensaje de WhatsApp" htmlFor="c-intro" help="Opcional. Por defecto: «Hola, quiero hacer este pedido del catálogo …».">
              <Input id="c-intro" value={form.messageIntro} onChange={(e) => set("messageIntro", e.target.value)} placeholder="Hola, quiero hacer este pedido:" disabled={!canWrite} />
            </Field>
            <Field label="Logo" htmlFor="c-logo" help="Opcional. Enlace a la imagen del logo (https://… o /brand/…). Aparece arriba del catálogo.">
              <div className="flex items-center gap-3">
                <Input id="c-logo" value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://…/logo.png" disabled={!canWrite} className="flex-1" />
                {form.logoUrl.trim() ? <img src={form.logoUrl.trim()} alt="" className={cn("h-10 w-16 shrink-0 rounded border border-border bg-white object-contain p-1", form.logoInvert && "invert")} /> : null}
              </div>
            </Field>
            <div className="divide-y divide-border rounded-md border border-border">
              {([
                ["logoInvert", "Invertir colores del logo", "Úsalo si tu logo es blanco: se verá negro sobre el fondo claro."],
                ["active", "Publicado", "Si lo desactivas, el enlace muestra «catálogo no disponible»."],
                ["hideOutOfStock", "Ocultar productos agotados", "Los productos sin unidades disponibles no aparecen."],
                ["showStock", "Mostrar unidades disponibles", "Muestra a los clientes cuántas unidades quedan."],
              ] as const).map(([k, label, help]) => (
                <Field key={k} inline label={<span><span className="block">{label}</span><span className="block text-sm font-normal text-muted-foreground">{help}</span></span>} className="px-3 py-2.5">
                  <Switch checked={form[k]} onCheckedChange={(v) => set(k, v)} disabled={!canWrite} />
                </Field>
              ))}
            </div>
          </div>
        </Card>

        <Card
          title="Productos"
          description={form.allProducts ? "Se muestran todos los productos activos del inventario, ordenados por nombre." : "Elige qué productos aparecen y en qué orden."}
          padded={false}
          actions={!form.allProducts && canWrite ? <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>Agregar productos</Button> : undefined}
        >
          <div className="border-b border-border px-4 py-3 sm:px-5">
            <Field inline label={<span><span className="block">Incluir todos los productos activos</span><span className="block text-sm font-normal text-muted-foreground">Los productos nuevos aparecen solos, sin tener que agregarlos.</span></span>}>
              <Switch checked={form.allProducts} onCheckedChange={(v) => set("allProducts", v)} disabled={!canWrite} />
            </Field>
          </div>
          {form.allProducts ? null : products.isLoading ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">Cargando productos…</p>
          ) : !selected.length ? (
            <EmptyState compact title="Sin productos" description="Agrega los productos que quieres mostrar en este catálogo." action={canWrite ? <Button variant="primary" size="sm" onClick={() => setPickerOpen(true)}>Agregar productos</Button> : undefined} />
          ) : (
            <>
              {hiddenCount ? <p className="border-b border-border bg-tone-warning-bg/40 px-5 py-2 text-sm">{hiddenCount} producto(s) no están activos y no se mostrarán hasta que los actives.</p> : null}
              <ul className="divide-y divide-border">
                {selected.map((p, idx) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                    <div className="min-w-0 flex-1"><ProductCell title={p.title} thumbUrl={p.images[0]?.thumbUrl} to={`/productos/${p.id}`} variantTitle={priceRange(p)} /></div>
                    {p.status !== "ACTIVE" ? <ProductStatusBadge status={p.status} /> : null}
                    {canWrite ? (
                      <div className="flex shrink-0">
                        <Button variant="ghost" size="icon-sm" aria-label="Subir" disabled={idx === 0} onClick={() => move(idx, -1)}><ArrowUp /></Button>
                        <Button variant="ghost" size="icon-sm" aria-label="Bajar" disabled={idx === selected.length - 1} onClick={() => move(idx, 1)}><ArrowDown /></Button>
                        <Button variant="ghost" size="icon-sm" aria-label="Quitar" onClick={() => set("productIds", form.productIds.filter((x) => x !== p.id))}><X /></Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {c && can("orders.read") ? <InquiriesCard catalogId={c.id} /> : null}

        {c && canWrite ? (
          <div className="flex justify-end">
            <Button variant="destructive-secondary" onClick={remove}><Trash2 />Eliminar catálogo</Button>
          </div>
        ) : null}
      </div>

      <ProductPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} products={products.data ?? []} selected={form.productIds} onAdd={(ids) => set("productIds", [...form.productIds, ...ids.filter((x) => !form.productIds.includes(x))])} />
      {dialog}
    </Page>
  );
}

function ProductPickerDialog({ open, onOpenChange, products, selected, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; products: Product[]; selected: string[]; onAdd: (ids: string[]) => void }) {
  const [q, setQ] = React.useState("");
  const [picked, setPicked] = React.useState<string[]>([]);
  React.useEffect(() => {
    if (open) {
      setPicked([]);
      setQ("");
    }
  }, [open]);
  const term = q.trim().toLowerCase();
  const list = products.filter((p) => !selected.includes(p.id) && p.status !== "ARCHIVED" && (!term || p.title.toLowerCase().includes(term) || p.variants.some((v) => v.sku.toLowerCase().includes(term)) || p.tags.some((t) => t.toLowerCase().includes(term))));
  const toggle = (pid: string) => setPicked((s) => (s.includes(pid) ? s.filter((x) => x !== pid) : [...s, pid]));
  const allPicked = list.length > 0 && list.every((p) => picked.includes(p.id));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>Agregar productos al catálogo</DialogTitle></DialogHeader>
        <DialogBody className="space-y-3">
          <Input autoFocus prefix={<Search className="h-4 w-4" />} placeholder="Buscar por nombre, SKU o etiqueta" value={q} onChange={(e) => setQ(e.target.value)} />
          {list.length ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={allPicked} onCheckedChange={() => setPicked(allPicked ? picked.filter((x) => !list.some((p) => p.id === x)) : [...new Set([...picked, ...list.map((p) => p.id)])])} />
              Seleccionar los {list.length} visibles
            </label>
          ) : null}
          <ul className="divide-y divide-border rounded-md border border-border">
            {list.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted-foreground">No hay más productos para agregar.</li> : null}
            {list.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-hover">
                  <Checkbox checked={picked.includes(p.id)} onCheckedChange={() => toggle(p.id)} />
                  <Thumb src={p.images[0]?.thumbUrl} alt={p.title} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.title}</span>
                    <span className="block truncate text-sm text-muted-foreground">{priceRange(p)} · {p.totalAvailable ?? 0} disponibles</span>
                  </span>
                  {p.status !== "ACTIVE" ? <ProductStatusBadge status={p.status} /> : null}
                </label>
              </li>
            ))}
          </ul>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" disabled={!picked.length} onClick={() => { onAdd(picked); onOpenChange(false); }}>Agregar {picked.length || ""}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const inquiryTone: Record<string, "info" | "success" | "neutral"> = { NEW: "info", CONFIRMED: "success", CANCELLED: "neutral" };

function InquiriesCard({ catalogId }: { catalogId: string }) {
  const { can } = useAuth();
  const invalidate = useInvalidate();
  const inquiries = useQuery({ queryKey: ["catalog-inquiries", catalogId], queryFn: () => api.get<{ data: CatalogInquiry[] }>(v1("/catalog-inquiries"), { catalog_id: catalogId, limit: 50 }), select: (d) => d.data });
  const [open, setOpen] = React.useState<CatalogInquiry | null>(null);
  const setStatus = async (inq: CatalogInquiry, status: string) => {
    try {
      await api.patch(v1(`/catalog-inquiries/${inq.id}`), { status });
      await invalidate("catalog-inquiries");
      toast.success("Estado actualizado");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo actualizar");
    }
  };
  return (
    <Card title="Pedidos enviados a WhatsApp" description="Cada carrito enviado queda registrado con su código, para buscarlo cuando llegue el mensaje." padded={false}>
      {inquiries.isLoading ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">Cargando…</p>
      ) : !inquiries.data?.length ? (
        <EmptyState compact title="Aún no hay pedidos" description="Cuando un cliente envíe su carrito aparecerá aquí." />
      ) : (
        <ul className="divide-y divide-border">
          {inquiries.data.map((i) => (
            <li key={i.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <button type="button" className="min-w-0 text-left" onClick={() => setOpen(i)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-medium hover:underline">{i.code}</span>
                  <Badge tone={inquiryTone[i.status] ?? "neutral"}>{inquiryStatusLabels[i.status] ?? i.status}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {i.customerName || "Sin nombre"} · {i.itemCount} unid. · <span className="tabular">{formatCOP(i.total)}</span> · <DateText value={i.createdAt} time />
                </div>
              </button>
              {can("orders.write") ? (
                <Select value={i.status} onValueChange={(v) => setStatus(i, v)}>
                  <SelectTrigger className="w-full sm:w-[160px]" aria-label="Estado del pedido"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(inquiryStatusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pedido {open?.code}</DialogTitle></DialogHeader>
          <DialogBody>
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 font-sans text-sm">{open?.message}</pre>
          </DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setOpen(null)}>Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
