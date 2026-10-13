import * as React from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, ImageIcon, Menu, Minus, Plus, Search, ShoppingBag, Trash2, X } from "lucide-react";
import { formatCOP, type PublicCatalogResponse, type PublicProduct } from "@inventario/shared";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Variant = PublicProduct["variants"][number];
type CartLine = { variantId: string; quantity: number };

const MAX_QTY = 999;

function WhatsappIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.04 21.5h-.01a9.45 9.45 0 0 1-4.81-1.32l-.35-.2-3.58.94.96-3.49-.23-.36a9.42 9.42 0 0 1-1.45-5.03c0-5.22 4.25-9.47 9.48-9.47 2.53 0 4.9.99 6.7 2.78a9.4 9.4 0 0 1 2.77 6.7c0 5.23-4.25 9.48-9.48 9.48m8.06-17.54A11.33 11.33 0 0 0 12.04.63C5.76.63.65 5.74.65 12.02c0 2 .52 3.96 1.52 5.69L.55 23.63l6.05-1.59a11.37 11.37 0 0 0 5.43 1.38h.01c6.28 0 11.39-5.11 11.39-11.39 0-3.04-1.18-5.9-3.33-8.05" />
    </svg>
  );
}

function useCart(slug: string) {
  const key = `catalog-cart:${slug}`;
  const [lines, setLines] = React.useState<CartLine[]>(() => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
      return Array.isArray(parsed) ? parsed.filter((l) => typeof l.variantId === "string" && l.quantity > 0) : [];
    } catch {
      return [];
    }
  });
  React.useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(lines));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [key, lines]);
  const add = (variantId: string, quantity: number, max = MAX_QTY) =>
    setLines((ls) => {
      const found = ls.find((l) => l.variantId === variantId);
      if (found) return ls.map((l) => (l.variantId === variantId ? { ...l, quantity: Math.min(max, l.quantity + quantity) } : l));
      return [...ls, { variantId, quantity: Math.min(max, quantity) }];
    });
  const setQty = (variantId: string, quantity: number) => setLines((ls) => (quantity <= 0 ? ls.filter((l) => l.variantId !== variantId) : ls.map((l) => (l.variantId === variantId ? { ...l, quantity } : l))));
  const clear = () => setLines([]);
  return { lines, setLines, add, setQty, clear };
}

const priceLabel = (p: PublicProduct) => {
  const prices = p.variants.map((v) => v.price);
  const min = Math.min(...prices);
  return { min, varies: prices.some((x) => x !== min) };
};

const maxFor = (v: Variant) => (v.available !== null ? v.available : MAX_QTY);

export default function PublicCatalogPage() {
  const { slug = "" } = useParams();
  const data = useQuery({
    queryKey: ["public-catalog", slug],
    queryFn: () => api.get<PublicCatalogResponse>(`/api/public/catalogs/${encodeURIComponent(slug)}`),
    retry: false,
    staleTime: 60_000,
  });
  const cart = useCart(slug);
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [openProduct, setOpenProduct] = React.useState<PublicProduct | null>(null);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => {
    if (data.data) document.title = `${data.data.catalog.name} · ${data.data.store.name}`;
  }, [data.data]);

  const variantIndex = React.useMemo(() => {
    const m = new Map<string, { product: PublicProduct; variant: Variant }>();
    for (const p of data.data?.products ?? []) for (const v of p.variants) m.set(v.id, { product: p, variant: v });
    return m;
  }, [data.data]);

  // Quita del carrito lo que ya no existe en el catálogo o está agotado.
  const { setLines } = cart;
  React.useEffect(() => {
    if (!data.data) return;
    setLines((ls) => ls.filter((l) => variantIndex.get(l.variantId)?.variant.inStock).map((l) => ({ ...l, quantity: Math.min(l.quantity, maxFor(variantIndex.get(l.variantId)!.variant)) })));
  }, [data.data, variantIndex, setLines]);

  if (data.isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="h-8 w-48 animate-pulse rounded bg-black/10" />
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-black/5" />)}
          </div>
        </div>
      </div>
    );
  }

  if (data.isError || !data.data) {
    const notFound = data.error instanceof ApiError && data.error.status === 404;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center">
          <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-semibold">{notFound ? "Catálogo no disponible" : "No pudimos cargar el catálogo"}</h1>
          <p className="mt-1 text-muted-foreground">{notFound ? "El enlace no existe o el catálogo ya no está publicado." : "Revisa tu conexión e inténtalo de nuevo."}</p>
          {!notFound ? <Button className="mt-4" onClick={() => data.refetch()}>Reintentar</Button> : null}
        </div>
      </div>
    );
  }

  const { catalog, store, products } = data.data;
  const categories = [...new Map(products.filter((p) => p.category).map((p) => [p.category!.id, p.category!])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const term = q.trim().toLowerCase();
  const visible = products.filter((p) => (!category || p.category?.id === category) && (!term || p.title.toLowerCase().includes(term) || (p.description ?? "").toLowerCase().includes(term)));

  const cartItems = cart.lines.map((l) => ({ ...l, ...variantIndex.get(l.variantId)! })).filter((l) => l.product);
  const cartCount = cartItems.reduce((a, l) => a + l.quantity, 0);
  const cartTotal = cartItems.reduce((a, l) => a + l.quantity * l.variant.price, 0);

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 pb-5 pt-6 text-center sm:pb-7 sm:pt-9">
          {catalog.logoUrl ? (
            <>
              <img src={catalog.logoUrl} alt={store.name} className={cn("mx-auto h-20 w-auto max-w-[70%] object-contain sm:h-28", catalog.logoInvert && "invert")} />
              <h1 className="sr-only">{catalog.name}</h1>
            </>
          ) : (
            <>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{store.name}{store.city ? ` · ${store.city}` : ""}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{catalog.name}</h1>
            </>
          )}
          {catalog.description ? <p className="mx-auto mt-3 max-w-xl whitespace-pre-line text-sm text-muted-foreground">{catalog.description}</p> : null}
        </div>
      </header>

      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex items-center gap-2">
            {categories.length ? (
              <button type="button" onClick={() => setMenuOpen(true)} aria-label="Ver categorías" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-input bg-card text-foreground hover:bg-surface-hover sm:h-9 sm:w-9 md:hidden">
                <Menu className="h-5 w-5" />
              </button>
            ) : null}
            <Input prefix={<Search className="h-4 w-4" />} placeholder="Buscar productos" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar productos" className="flex-1 bg-card" />
          </div>
          {categories.length ? (
            <nav aria-label="Categorías" className="scrollbar-thin -mx-4 mt-3 hidden gap-6 overflow-x-auto px-4 md:flex">
              {[{ id: "", name: "Todo" }, ...categories].map((c) => (
                <button key={c.id} type="button" onClick={() => setCategory(c.id)} className={cn("shrink-0 border-b-2 pb-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors", category === c.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  {c.name}
                </button>
              ))}
            </nav>
          ) : null}
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-5">
        {visible.length ? (
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">{categories.find((c) => c.id === category)?.name ?? (term ? "Resultados" : "Todos los productos")}</h2>
            <span className="text-sm text-muted-foreground">{visible.length} {visible.length === 1 ? "producto" : "productos"}</span>
          </div>
        ) : null}
        {!visible.length ? (
          <div className="py-16 text-center text-muted-foreground">{products.length ? "No encontramos productos con esa búsqueda." : "Este catálogo aún no tiene productos."}</div>
        ) : (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4">
            {visible.map((p) => (
              <li key={p.id}>
                <ProductCard product={p} showStock={catalog.showStock} onOpen={() => setOpenProduct(p)} onQuickAdd={(v) => cart.add(v.id, 1, maxFor(v))} />
              </li>
            ))}
          </ul>
        )}
      </main>

      {cartCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4">
          <button type="button" onClick={() => setCartOpen(true)} className="mx-auto flex h-14 w-full max-w-md items-center justify-between gap-3 rounded-full bg-[#1a1a1a] px-5 text-white shadow-popover transition-transform active:scale-[0.99]">
            <span className="flex items-center gap-2 font-medium">
              <span className="relative"><ShoppingBag className="h-5 w-5" /><span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25D366] px-1 text-xs font-semibold text-white">{cartCount}</span></span>
              <span className="ml-2">Ver carrito</span>
            </span>
            <span className="tabular font-semibold">{formatCOP(cartTotal)}</span>
          </button>
        </div>
      ) : null}

      <CategoryDrawer
        open={menuOpen}
        onOpenChange={setMenuOpen}
        logo={catalog.logoUrl ? { url: catalog.logoUrl, invert: catalog.logoInvert, alt: store.name } : null}
        title={catalog.name}
        categories={[{ id: "", name: "Todo", count: products.length }, ...categories.map((c) => ({ ...c, count: products.filter((p) => p.category?.id === c.id).length }))]}
        active={category}
        onPick={(id) => {
          setCategory(id);
          setMenuOpen(false);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
      <ProductDialog product={openProduct} showStock={catalog.showStock} onClose={() => setOpenProduct(null)} onAdd={(v, qty) => { cart.add(v.id, qty, maxFor(v)); setOpenProduct(null); }} />
      <CartDialog open={cartOpen} onOpenChange={setCartOpen} slug={slug} items={cartItems} total={cartTotal} setQty={cart.setQty} onSent={cart.clear} />
    </div>
  );
}

function ProductCard({ product: p, showStock, onOpen, onQuickAdd }: { product: PublicProduct; showStock: boolean; onOpen: () => void; onQuickAdd: (v: Variant) => void }) {
  const img = p.images[0];
  const { min, varies } = priceLabel(p);
  const inStock = p.variants.some((v) => v.inStock);
  const single = p.variants.length === 1 ? p.variants[0]! : null;
  const compare = single?.compareAtPrice && single.compareAtPrice > single.price ? single.compareAtPrice : null;
  const stockTotal = showStock && p.variants.every((v) => v.available !== null) ? p.variants.reduce((a, v) => a + (v.available ?? 0), 0) : null;
  return (
    <div className="group flex h-full flex-col">
      <button type="button" onClick={onOpen} className="relative block aspect-square w-full overflow-hidden rounded-md bg-muted">
        {img ? <img src={img.thumbUrl} alt={img.alt ?? p.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" /> : <ImageIcon className="absolute inset-0 m-auto h-8 w-8 text-muted-foreground" />}
        {!inStock ? <span className="absolute left-2 top-2 rounded-md bg-[#1a1a1a]/85 px-2 py-0.5 text-xs font-medium text-white">Agotado</span> : compare ? <span className="absolute left-2 top-2 rounded-md bg-destructive px-2 py-0.5 text-xs font-medium text-white">Oferta</span> : null}
      </button>
      <div className="flex flex-1 flex-col gap-1 pt-2.5">
        {p.category ? <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{p.category.name}</p> : null}
        <button type="button" onClick={onOpen} className="line-clamp-2 text-left font-medium leading-5 hover:underline">{p.title}</button>
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div className="min-w-0">
            {compare ? <div className="tabular text-xs text-muted-foreground line-through">{formatCOP(compare)}</div> : null}
            <div className="tabular font-semibold">{varies ? <span className="text-xs font-normal text-muted-foreground">Desde </span> : null}{formatCOP(min)}</div>
            {stockTotal !== null && inStock ? <div className="text-xs text-muted-foreground">{stockTotal} disponibles</div> : null}
          </div>
          {inStock ? (
            <button
              type="button"
              aria-label={`Agregar ${p.title}`}
              onClick={() => (single ? onQuickAdd(single) : onOpen())}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#111] text-white hover:bg-black active:scale-95"
            >
              <Plus className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function QtyStepper({ value, onChange, max, size = "md" }: { value: number; onChange: (n: number) => void; max: number; size?: "sm" | "md" }) {
  const h = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  return (
    <div className="inline-flex items-center rounded-full border border-input bg-card">
      <button type="button" className={cn("flex items-center justify-center rounded-full hover:bg-black/5", h)} onClick={() => onChange(value - 1)} aria-label="Restar"><Minus className="h-4 w-4" /></button>
      <span className="tabular min-w-8 text-center font-medium">{value}</span>
      <button type="button" className={cn("flex items-center justify-center rounded-full hover:bg-black/5 disabled:opacity-40", h)} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Sumar"><Plus className="h-4 w-4" /></button>
    </div>
  );
}

function ProductDialog({ product, showStock, onClose, onAdd }: { product: PublicProduct | null; showStock: boolean; onClose: () => void; onAdd: (v: Variant, qty: number) => void }) {
  const [selected, setSelected] = React.useState<Record<string, string>>({});
  const [qty, setQty] = React.useState(1);
  const [imageIdx, setImageIdx] = React.useState(0);

  React.useEffect(() => {
    if (!product) return;
    const first = product.variants.find((v) => v.inStock) ?? product.variants[0];
    setSelected(first ? { ...first.optionValues } : {});
    setQty(1);
    setImageIdx(0);
  }, [product]);

  if (!product) return <Dialog open={false} />;
  const p = product;
  const options = p.options.filter((o) => o.values.length);
  const match = (vals: Record<string, string>) => p.variants.find((v) => options.every((o) => v.optionValues[o.name] === vals[o.name]));
  const variant = options.length ? match(selected) : p.variants[0];

  const pick = (name: string, value: string) => {
    const next = { ...selected, [name]: value };
    if (match(next)) return setSelected(next);
    const fallback = p.variants.find((v) => v.optionValues[name] === value && v.inStock) ?? p.variants.find((v) => v.optionValues[name] === value);
    setSelected(fallback ? { ...fallback.optionValues } : next);
  };
  const valueState = (name: string, value: string) => {
    const v = match({ ...selected, [name]: value });
    if (v) return v.inStock ? "ok" : "out";
    return p.variants.some((x) => x.optionValues[name] === value && x.inStock) ? "ok" : "out";
  };

  const variantImageIdx = variant?.imageId ? p.images.findIndex((i) => i.id === variant.imageId) : -1;
  const shownIdx = variantImageIdx >= 0 && imageIdx === 0 ? variantImageIdx : imageIdx;
  const image = p.images[shownIdx] ?? p.images[0];
  const max = variant ? maxFor(variant) : 0;
  const compare = variant?.compareAtPrice && variant.compareAtPrice > variant.price ? variant.compareAtPrice : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" className="p-0">
        <DialogHeader className="sr-only"><DialogTitle>{p.title}</DialogTitle></DialogHeader>
        <DialogBody className="p-0">
          <div className="grid sm:grid-cols-2">
            <div className="bg-muted">
              <div className="relative aspect-square w-full">
                {image ? <img src={image.url} alt={image.alt ?? p.title} className="h-full w-full object-cover" /> : <ImageIcon className="absolute inset-0 m-auto h-10 w-10 text-muted-foreground" />}
              </div>
              {p.images.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto p-2">
                  {p.images.map((img, i) => (
                    <button key={img.id} type="button" onClick={() => setImageIdx(i)} className={cn("h-14 w-14 shrink-0 overflow-hidden rounded-md border-2", i === shownIdx ? "border-primary" : "border-transparent")}>
                      <img src={img.thumbUrl} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-4 p-5">
              <div>
                {p.category ? <p className="text-sm text-muted-foreground">{p.category.name}</p> : null}
                <h2 className="text-lg font-semibold leading-6">{p.title}</h2>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="tabular text-xl font-semibold">{formatCOP(variant?.price ?? 0)}</span>
                  {compare ? <span className="tabular text-muted-foreground line-through">{formatCOP(compare)}</span> : null}
                </div>
                {variant && !variant.inStock ? <p className="mt-1 text-sm font-medium text-destructive">Agotado</p> : showStock && variant?.available !== null && variant ? <p className="mt-1 text-sm text-muted-foreground">{variant.available} disponibles</p> : null}
              </div>
              {options.map((o) => (
                <div key={o.name}>
                  <p className="mb-1.5 text-sm font-medium">{o.name}: <span className="font-normal text-muted-foreground">{selected[o.name]}</span></p>
                  <div className="flex flex-wrap gap-2">
                    {o.values.map((val) => {
                      const st = valueState(o.name, val);
                      const active = selected[o.name] === val;
                      return (
                        <button key={val} type="button" onClick={() => pick(o.name, val)} className={cn("min-w-10 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors", active ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-surface-hover", st === "out" && !active && "text-muted-foreground line-through decoration-1")}>
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {p.description ? <p className="whitespace-pre-line text-sm text-muted-foreground">{p.description}</p> : null}
            </div>
          </div>
        </DialogBody>
        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <QtyStepper value={qty} onChange={(n) => setQty(Math.max(1, Math.min(max || 1, n)))} max={max} />
          <Button variant="primary" size="lg" className="flex-1 sm:flex-none" disabled={!variant || !variant.inStock} onClick={() => variant && onAdd(variant, qty)}>
            {variant && !variant.inStock ? "Agotado" : !variant ? "No disponible" : `Agregar · ${formatCOP((variant.price ?? 0) * qty)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CartDialog({ open, onOpenChange, slug, items, total, setQty, onSent }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  slug: string;
  items: { variantId: string; quantity: number; product: PublicProduct; variant: Variant }[];
  total: number;
  setQty: (id: string, n: number) => void;
  onSent: () => void;
}) {
  const [name, setName] = React.useState(() => {
    try {
      return localStorage.getItem("catalog-customer-name") ?? "";
    } catch {
      return "";
    }
  });
  const [note, setNote] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState<{ code: string; url: string } | null>(null);

  React.useEffect(() => {
    if (open) setError(null);
    if (!open) setSent(null);
  }, [open]);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      try {
        localStorage.setItem("catalog-customer-name", name.trim());
      } catch {
        /* sin almacenamiento */
      }
      const res = await api.post<{ code: string; whatsappUrl: string }>(`/api/public/catalogs/${encodeURIComponent(slug)}/checkout`, {
        items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        customerName: name.trim() || undefined,
        note: note.trim() || undefined,
      });
      setSent({ code: res.code, url: res.whatsappUrl });
      onSent();
      setNote("");
      window.location.href = res.whatsappUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar el pedido. Revisa tu conexión.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{sent ? "¡Pedido listo!" : "Tu carrito"}</DialogTitle></DialogHeader>
        {sent ? (
          <>
            <DialogBody className="space-y-3 text-center">
              <WhatsappIcon className="mx-auto h-12 w-12 text-[#25D366]" />
              <p>Te llevamos a WhatsApp con tu pedido <span className="font-mono font-semibold">{sent.code}</span>. Solo tienes que tocar <strong>Enviar</strong>.</p>
              <p className="text-sm text-muted-foreground">¿No se abrió WhatsApp? Usa el botón de abajo.</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>Seguir viendo</Button>
              <Button asChild className="border-0 bg-[#25D366] text-white hover:bg-[#1ebe5b]"><a href={sent.url}><WhatsappIcon className="h-4 w-4" />Abrir WhatsApp</a></Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogBody className="space-y-4">
              {!items.length ? <p className="py-6 text-center text-muted-foreground">Tu carrito está vacío.</p> : null}
              <ul className="divide-y divide-border">
                {items.map(({ variantId, quantity, product, variant }) => {
                  const img = (variant.imageId && product.images.find((i) => i.id === variant.imageId)) || product.images[0];
                  return (
                    <li key={variantId} className="flex gap-3 py-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted">{img ? <img src={img.thumbUrl} alt="" className="h-full w-full object-cover" /> : null}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{product.title}</p>
                            {variant.title !== "Default" ? <p className="text-sm text-muted-foreground">{variant.title}</p> : null}
                          </div>
                          <button type="button" aria-label="Quitar" onClick={() => setQty(variantId, 0)} className="rounded-md p-1 text-muted-foreground hover:bg-black/5"><Trash2 className="h-4 w-4" /></button>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <QtyStepper size="sm" value={quantity} onChange={(n) => setQty(variantId, Math.min(n, maxFor(variant)))} max={maxFor(variant)} />
                          <span className="tabular font-semibold">{formatCOP(variant.price * quantity)}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {items.length ? (
                <>
                  <div className="flex items-center justify-between border-t border-border pt-3 text-md font-semibold">
                    <span>Total</span>
                    <span className="tabular">{formatCOP(total)}</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="cart-name" className="mb-1 block text-sm font-medium">Tu nombre <span className="font-normal text-muted-foreground">(opcional)</span></label>
                      <Input id="cart-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
                    </div>
                    <div>
                      <label htmlFor="cart-note" className="mb-1 block text-sm font-medium">Nota <span className="font-normal text-muted-foreground">(opcional)</span></label>
                      <Textarea id="cart-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Dirección, barrio, forma de pago…" maxLength={1000} />
                    </div>
                  </div>
                </>
              ) : null}
              {error ? <p className="rounded-md bg-tone-critical-bg px-3 py-2 text-sm text-tone-critical-fg" role="alert">{error}</p> : null}
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => onOpenChange(false)}><X />Seguir comprando</Button>
              <Button size="lg" disabled={!items.length || sending} loading={sending} onClick={send} className="border-0 bg-[#25D366] text-white shadow-none hover:bg-[#1ebe5b]">
                {!sending ? <WhatsappIcon className="h-5 w-5" /> : null}Pedir por WhatsApp
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CategoryDrawer({ open, onOpenChange, logo, title, categories, active, onPick }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  logo: { url: string; invert: boolean; alt: string } | null;
  title: string;
  categories: { id: string; name: string; count: number }[];
  active: string;
  onPick: (id: string) => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[82%] max-w-xs flex-col bg-card shadow-popover duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            {logo ? <img src={logo.url} alt={logo.alt} className={cn("h-10 w-auto object-contain", logo.invert && "invert")} /> : <span className="font-semibold">{title}</span>}
            <DialogPrimitive.Close className="rounded-md p-1.5 text-muted-foreground hover:bg-black/5 hover:text-foreground" aria-label="Cerrar">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Title className="px-5 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Categorías</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Elige una categoría para filtrar el catálogo</DialogPrimitive.Description>
          <ul className="flex-1 overflow-y-auto pb-6">
            {categories.map((c) => {
              const on = active === c.id;
              return (
                <li key={c.id || "all"}>
                  <button type="button" onClick={() => onPick(c.id)} className={cn("flex w-full items-center justify-between gap-3 border-l-2 px-5 py-3 text-left text-sm uppercase tracking-[0.12em] transition-colors", on ? "border-foreground bg-black/[0.03] font-semibold text-foreground" : "border-transparent text-foreground/80 hover:bg-black/[0.03]")}>
                    <span className="flex items-center gap-2">{c.name}{on ? <Check className="h-4 w-4" /> : null}</span>
                    <span className="text-xs font-normal tabular-nums text-muted-foreground">{c.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
