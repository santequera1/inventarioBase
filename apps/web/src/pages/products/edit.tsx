import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm, useFieldArray, Controller, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { createProductBody, productOption, variantInput } from "@inventario/shared";
import { Page, PageHeader, Card, TwoColumn } from "@/components/app/page";
import { Field, FormRow, TextField, TextareaField, SelectField, UnsavedBar } from "@/components/app/form";
import { ErrorState, PageSkeleton } from "@/components/app/states";
import { ProductStatusBadge } from "@/components/app/badges";
import { Thumb } from "@/components/app/product-cell";
import { Money, Qty } from "@/components/app/format";
import { useConfirm } from "@/components/app/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { api, ApiError, v1 } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCategories, useInvalidate, useLocations, useSuppliersAll, type Product } from "@/lib/queries";
import { cn, newIdempotencyKey } from "@/lib/utils";

const formSchema = createProductBody.extend({
  options: z.array(productOption),
  variants: z
    .array(
      variantInput
        .extend({
          price: z.coerce.number().int().min(0, "Introduce un precio en COP (entero, sin decimales)"),
          cost: z.coerce.number().int().min(0).nullable().optional(),
          compareAtPrice: z.coerce.number().int().min(0).nullable().optional(),
          /** Solo en el formulario: precio rebajado. Al guardar pasa a `price` y el precio normal a `compareAtPrice`. */
          salePrice: z.coerce.number().int().min(0).nullable().optional(),
          weightGrams: z.coerce.number().int().min(0).nullable().optional(),
        })
        .superRefine((v, ctx) => {
          if (v.salePrice != null && v.salePrice >= v.price) ctx.addIssue({ code: "custom", path: ["salePrice"], message: "Debe ser menor que el precio normal" });
        }),
    )
    .min(1, "Añade al menos una variante"),
});
type Form = z.infer<typeof formSchema>;

/** Campo numérico opcional: vacío = null (no 0). */
const optionalNumber = { setValueAs: (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v)) };

function cartesian(options: { name: string; values: string[] }[]): Record<string, string>[] {
  if (options.length === 0) return [{}];
  return options.reduce<Record<string, string>[]>((acc, opt) => acc.flatMap((combo) => opt.values.filter(Boolean).map((v) => ({ ...combo, [opt.name]: v }))), [{}]);
}
const skuFrom = (title: string, ov: Record<string, string>) =>
  [title.slice(0, 3), ...Object.values(ov).map((v) => v.slice(0, 3))].join("-").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9-]/g, "");

export default function ProductEditPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { can } = useAuth();
  const categories = useCategories();
  const suppliers = useSuppliersAll();
  const locations = useLocations();
  const invalidate = useInvalidate();
  const { confirm, dialog } = useConfirm();
  const product = useQuery({ queryKey: ["product", id], queryFn: () => api.get<Product>(v1(`/products/${id}`)), enabled: !isNew });
  const [images, setImages] = React.useState<{ id: string; url: string; thumbUrl: string }[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [tagInput, setTagInput] = React.useState("");
  const [newCategory, setNewCategory] = React.useState("");

  const form = useForm<Form>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", description: "", status: "ACTIVE", categoryId: null, supplierId: null, tags: [], taxRate: 19, options: [], variants: [{ sku: "", price: 0, cost: null, compareAtPrice: null, salePrice: null, barcode: "", weightGrams: null, optionValues: {}, trackInventory: true, active: true, initialStock: [] }], imageIds: [] },
  });
  const { control, watch, setValue, getValues, reset, formState } = form;
  const variants = useFieldArray({ control, name: "variants", keyName: "_k" });
  const options = useFieldArray({ control, name: "options", keyName: "_k" });
  const watchedOptions = watch("options");
  const watchedTags = watch("tags");
  const watchedVariants = watch("variants");
  const watchedTitle = watch("title");
  const hasOptions = watchedOptions.length > 0;
  const [bulk, setBulk] = React.useState<{ price: string; salePrice: string; cost: string }>({ price: "", salePrice: "", cost: "" });

  React.useEffect(() => {
    const p = product.data;
    if (!p) return;
    reset({
      title: p.title, description: p.description ?? "", status: p.status, categoryId: p.categoryId, supplierId: p.supplierId, tags: p.tags, taxRate: p.taxRate as 0 | 5 | 19, options: p.options,
      variants: p.variants.map((v) => ({ id: v.id, title: v.title, sku: v.sku, barcode: v.barcode ?? "", ...(v.compareAtPrice && v.compareAtPrice > v.price ? { price: v.compareAtPrice, salePrice: v.price } : { price: v.price, salePrice: null }), compareAtPrice: null, cost: v.cost, weightGrams: v.weightGrams, optionValues: v.optionValues, position: v.position, trackInventory: v.trackInventory, active: v.active, imageId: v.imageId })),
      imageIds: p.images.map((i) => i.id),
    });
    setImages(p.images.map((i) => ({ id: i.id, url: i.url, thumbUrl: i.thumbUrl })));
  }, [product.data, reset]);

  /**
   * Regenera variantes a partir de las opciones. Conserva las variantes existentes:
   * primero por coincidencia exacta y, si no, por coincidencia parcial (p. ej. al añadir
   * "Color" a un producto que solo tenía "Talla", la variante S conserva SKU y stock en el primer color).
   */
  const regenerateVariants = React.useCallback(
    (override?: { name: string; values: string[] }[]) => {
      const opts = (override ?? getValues("options")).map((o) => ({ name: o.name.trim(), values: o.values.map((v) => v.trim()).filter(Boolean) })).filter((o) => o.name && o.values.length);
      const combos = cartesian(opts);
      const current = getValues("variants");
      const used = new Set<number>();
      const claim = (pred: (v: (typeof current)[number]) => boolean) => {
        const idx = current.findIndex((v, i) => !used.has(i) && pred(v));
        if (idx === -1) return undefined;
        used.add(idx);
        return current[idx];
      };
      const next = combos.map((ov, i) => {
        const key = JSON.stringify(ov);
        const existing =
          claim((v) => JSON.stringify(v.optionValues) === key) ??
          claim((v) => Object.entries(v.optionValues ?? {}).every(([k, val]) => ov[k] === val) && Object.keys(v.optionValues ?? {}).length < Object.keys(ov).length) ??
          (combos.length === 1 ? claim(() => true) : undefined);
        return existing
          ? { ...existing, sku: existing.sku?.trim() || skuFrom(getValues("title") || "SKU", ov), optionValues: ov, position: i }
          : { sku: skuFrom(getValues("title") || "SKU", ov), price: current[0]?.price ?? 0, salePrice: current[0]?.salePrice ?? null, cost: current[0]?.cost ?? null, compareAtPrice: null, barcode: "", weightGrams: null, optionValues: ov, trackInventory: true, active: true, position: i, initialStock: [] };
      });
      setValue("variants", next, { shouldDirty: true });
    },
    [getValues, setValue],
  );

  /** Renombra una opción y actualiza las claves de optionValues en las variantes. */
  const renameOption = (oi: number, name: string) => {
    const opts = getValues("options");
    const oldName = opts[oi]?.name ?? "";
    setValue(`options.${oi}.name`, name, { shouldDirty: true });
    if (oldName && oldName !== name) {
      const vars = getValues("variants").map((v) => {
        const ov: Record<string, string> = {};
        for (const [k, val] of Object.entries(v.optionValues ?? {})) ov[k === oldName ? name : k] = val;
        return { ...v, optionValues: ov };
      });
      setValue("variants", vars, { shouldDirty: true });
    }
  };

  /** Añade valores (separados por coma) a una opción y regenera. */
  const addOptionValues = (oi: number, raw: string, field: { value: string[]; onChange: (v: string[]) => void }) => {
    const vals = raw.split(",").map((x) => x.trim()).filter(Boolean);
    const next = [...field.value.filter(Boolean), ...vals.filter((v) => !field.value.includes(v))];
    if (next.length === field.value.filter(Boolean).length) return;
    field.onChange(next);
    const opts = getValues("options").map((o, i) => (i === oi ? { ...o, values: next } : o));
    regenerateVariants(opts);
  };

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", f);
        const img = await api.upload<{ id: string; url: string; thumbUrl: string }>(v1("/uploads/images"), fd);
        setImages((prev) => [...prev, img]);
        setValue("imageIds", [...(getValues("imageIds") ?? []), img.id], { shouldDirty: true });
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo subir la imagen");
    } finally {
      setUploading(false);
    }
  };
  const removeImage = (imgId: string) => {
    setImages((prev) => prev.filter((i) => i.id !== imgId));
    setValue("imageIds", (getValues("imageIds") ?? []).filter((x) => x !== imgId), { shouldDirty: true });
  };

  const save = form.handleSubmit(
    async (values) => {
      const payload = { ...values, description: values.description || null, variants: values.variants.map(({ salePrice, ...v }) => ({ ...v, ...(salePrice != null && salePrice < v.price ? { price: salePrice, compareAtPrice: v.price } : { compareAtPrice: null }), barcode: v.barcode || null, initialStock: isNew ? v.initialStock?.filter((s) => s.available > 0) : undefined })) };
      try {
        if (isNew) {
          const created = await api.post<Product>(v1("/products"), payload, newIdempotencyKey());
          toast.success("Producto creado");
          await invalidate("products", "inventory-levels", "inventory-summary");
          navigate(`/productos/${created.id}`, { replace: true });
        } else {
          await api.patch<Product>(v1(`/products/${id}`), payload);
          toast.success("Cambios guardados");
          await invalidate("products", "product", "inventory-levels", "level");
        }
      } catch (err) {
        if (err instanceof ApiError) {
          const fe = err.fieldErrors();
          Object.entries(fe).forEach(([k, m]) => form.setError(k as keyof Form, { message: m }));
          toast.error(err.message);
        } else toast.error("No se pudo guardar");
      }
    },
    (errors) => {
      const first = (function find(e: unknown, path: string[] = []): string | null {
        if (!e || typeof e !== "object") return null;
        if ("message" in e && typeof (e as { message?: unknown }).message === "string") {
          const label = path[0] === "variants" ? `Variante ${Number(path[1]) + 1}` : path[0] === "options" ? `Opción ${Number(path[1]) + 1}` : path.join(".");
          return `${label}: ${(e as { message: string }).message}`;
        }
        for (const [k, v] of Object.entries(e as Record<string, unknown>)) {
          const r = find(v, [...path, k]);
          if (r) return r;
        }
        return null;
      })(errors);
      toast.error("Revisa los campos marcados en rojo", { description: first ?? undefined });
    },
  );

  const archive = async () => {
    if (!(await confirm({ title: "¿Eliminar este producto?", description: "Si tiene historial de movimientos o ventas se archivará en lugar de eliminarse. Esta acción no afecta al libro de movimientos.", confirmLabel: "Eliminar", destructive: true }))) return;
    try {
      const r = await api.delete<{ archived: boolean }>(v1(`/products/${id}`));
      toast.success(r.archived ? "Producto archivado" : "Producto eliminado");
      await invalidate("products", "inventory-levels");
      navigate("/productos");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo eliminar");
    }
  };

  if (!isNew && product.isLoading) return <Page><PageSkeleton /></Page>;
  if (!isNew && (product.isError || !product.data)) return <Page><ErrorState error={product.error} /></Page>;
  const readOnly = !can("products.write");
  const totalAvailable = product.data?.totalAvailable;

  return (
    <Page>
      <UnsavedBar visible={formState.isDirty && !readOnly} onDiscard={() => (isNew ? navigate("/productos") : reset())} onSave={() => void save()} saving={formState.isSubmitting} />
      <PageHeader
        backTo="/productos"
        title={isNew ? "Agregar producto" : product.data?.title}
        badge={!isNew && product.data ? <ProductStatusBadge status={product.data.status} /> : undefined}
        primaryAction={!readOnly ? <Button variant="primary" onClick={() => void save()} loading={formState.isSubmitting} disabled={!isNew && !formState.isDirty}>{isNew ? "Guardar producto" : "Guardar"}</Button> : undefined}
        secondaryActions={!isNew && !readOnly ? <Button variant="destructive-secondary" onClick={archive}><Trash2 /> Eliminar</Button> : undefined}
      />
      <form onSubmit={(e) => e.preventDefault()} noValidate>
        <TwoColumn
          main={
            <>
              <Card>
                <div className="space-y-4">
                  <TextField control={control} name="title" label="Título" required inputProps={{ placeholder: "Camiseta básica algodón", readOnly }} />
                  <TextareaField control={control} name="description" label="Descripción" rows={4} />
                </div>
              </Card>

              <Card title="Imágenes" description="Primera imagen = miniatura del producto. JPG, PNG o WEBP.">
                <div className="flex flex-wrap gap-3">
                  {images.map((img) => (
                    <div key={img.id} className="group relative">
                      <Thumb src={img.thumbUrl} size="lg" />
                      {!readOnly ? <button type="button" onClick={() => removeImage(img.id)} className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-foreground text-white group-hover:flex" aria-label="Quitar imagen"><X className="h-3 w-3" /></button> : null}
                    </div>
                  ))}
                  {!readOnly ? (
                    <label className={cn("flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input text-xs text-muted-foreground hover:border-foreground hover:text-foreground", uploading && "opacity-50")}>
                      <ImagePlus className="h-4 w-4" />
                      {uploading ? "Subiendo…" : "Añadir"}
                      <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => onUpload(e.target.files)} disabled={uploading} />
                    </label>
                  ) : null}
                </div>
              </Card>

              <Card title="Precio e impuestos">
                <FormRow cols={2}>
                  {!hasOptions ? <TextField control={control} name="variants.0.price" label="Precio" required parse="money" help="Precio normal de venta, IVA incluido." inputProps={{ prefix: "$", min: 0 }} /> : null}
                  {!hasOptions ? <TextField control={control} name="variants.0.salePrice" label="Precio con descuento" parse="money" help="Opcional. Si lo llenas, se vende a este precio y el normal aparece tachado." inputProps={{ prefix: "$", placeholder: "Sin descuento" }} /> : null}
                  {!hasOptions ? <TextField control={control} name="variants.0.cost" label="Costo por unidad" parse="money" help="Lo que te cuesta a ti. Solo para calcular tu ganancia." inputProps={{ prefix: "$" }} /> : null}
                  <SelectField control={control} name="taxRate" label="IVA" numeric options={[{ value: "0", label: "0 % (excluido / exento)" }, { value: "5", label: "5 %" }, { value: "19", label: "19 %" }]} />
                </FormRow>
                {!hasOptions ? <Profit price={watchedVariants[0]?.price} salePrice={watchedVariants[0]?.salePrice} cost={watchedVariants[0]?.cost} className="mt-3" /> : (
                  <p className="mt-3 text-sm text-muted-foreground">Este producto tiene variantes: el precio, el descuento y el costo se definen en cada variante, más abajo.</p>
                )}
                <Controller control={control} name="taxRate" render={({ field }) => <input type="hidden" value={field.value} readOnly />} />
              </Card>

              <Card title="Variantes" description="Añade opciones como Talla o Color para generar variantes con SKU propio." actions={!readOnly ? <Button type="button" variant="secondary" size="sm" onClick={() => options.append({ name: ["Talla", "Color", "Material"].find((n) => !getValues("options").some((o) => o.name.trim().toLowerCase() === n.toLowerCase())) ?? "", values: [] })} disabled={options.fields.length >= 3}><Plus /> Añadir opción</Button> : undefined}>
                {options.fields.length > 0 ? (
                  <div className="mb-4 space-y-3">
                    {options.fields.map((o, oi) => (
                      <div key={o._k} className="rounded-md border border-border p-3">
                        <div className="flex items-end gap-2">
                          <Field label="Nombre de la opción" className="flex-1" htmlFor={`opt-${oi}`}>
                            <Controller control={control} name={`options.${oi}.name`} render={({ field }) => <Input id={`opt-${oi}`} value={field.value} onChange={(e) => renameOption(oi, e.target.value)} onBlur={() => regenerateVariants()} placeholder="Talla, Color, Material…" readOnly={readOnly} />} />
                          </Field>
                          {!readOnly ? <Button type="button" variant="ghost" size="icon" aria-label="Quitar opción" onClick={() => { const rest = getValues("options").filter((_, i) => i !== oi); options.remove(oi); regenerateVariants(rest); }}><Trash2 /></Button> : null}
                        </div>
                        <Controller
                          control={control}
                          name={`options.${oi}.values`}
                          render={({ field, fieldState }) => (
                            <Field label="Valores" className="mt-3" error={fieldState.error?.message} help="Escribe cada valor y pulsa Enter, coma o “Añadir”. Puedes pegar varios separados por coma.">
                              <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-card p-1.5 focus-within:ring-2 focus-within:ring-ring">
                                {field.value.filter(Boolean).map((v, vi) => (
                                  <Badge key={vi} tone="neutral" className="h-7 gap-1 pr-1 text-sm">
                                    {v}
                                    {!readOnly ? <button type="button" onClick={() => { const next = field.value.filter((x) => x !== v); field.onChange(next); regenerateVariants(getValues("options").map((o, i) => (i === oi ? { ...o, values: next } : o))); }} className="rounded p-0.5 hover:bg-black/10" aria-label={`Quitar ${v}`}><X className="h-3 w-3" /></button> : null}
                                  </Badge>
                                ))}
                                {!readOnly ? (
                                  <>
                                    <input
                                      className="h-7 min-w-[100px] flex-1 bg-transparent px-1 text-base outline-none"
                                      placeholder={field.value.filter(Boolean).length ? "Añadir valor…" : "Ej. S, M, L  o  Rojo, Azul"}
                                      aria-label={`Valores de ${watchedOptions[oi]?.name || "la opción"}`}
                                      onKeyDown={(e) => {
                                        const el = e.currentTarget;
                                        if ((e.key === "Enter" || e.key === "," || e.key === "Tab") && el.value.trim()) {
                                          e.preventDefault();
                                          addOptionValues(oi, el.value, field);
                                          el.value = "";
                                        }
                                      }}
                                      onBlur={(e) => {
                                        const el = e.currentTarget;
                                        if (el.value.trim()) {
                                          addOptionValues(oi, el.value, field);
                                          el.value = "";
                                        }
                                      }}
                                    />
                                    <button
                                      type="button"
                                      className="h-7 rounded-sm px-2 text-sm font-medium text-muted-foreground hover:bg-black/5 hover:text-foreground"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={(e) => {
                                        const el = e.currentTarget.previousElementSibling as HTMLInputElement | null;
                                        if (el?.value.trim()) {
                                          addOptionValues(oi, el.value, field);
                                          el.value = "";
                                        }
                                        el?.focus();
                                      }}
                                    >
                                      Añadir
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </Field>
                          )}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                {hasOptions && variants.fields.length > 1 && !readOnly ? (
                  <div className="mb-4 rounded-md bg-muted p-3">
                    <div className="mb-2 text-sm font-medium">Aplicar a todas las variantes</div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] [&>*]:min-w-0">
                      <Input type="number" inputMode="numeric" prefix="$" placeholder="Precio" aria-label="Precio para todas" value={bulk.price} onChange={(e) => setBulk((b) => ({ ...b, price: e.target.value }))} />
                      <Input type="number" inputMode="numeric" prefix="$" placeholder="Descuento" aria-label="Precio con descuento para todas" value={bulk.salePrice} onChange={(e) => setBulk((b) => ({ ...b, salePrice: e.target.value }))} />
                      <Input type="number" inputMode="numeric" prefix="$" placeholder="Costo" aria-label="Costo para todas" value={bulk.cost} onChange={(e) => setBulk((b) => ({ ...b, cost: e.target.value }))} />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!bulk.price && !bulk.salePrice && !bulk.cost}
                        onClick={() => {
                          getValues("variants").forEach((_, i) => {
                            if (bulk.price) setValue(`variants.${i}.price`, Number(bulk.price), { shouldDirty: true });
                            if (bulk.salePrice) setValue(`variants.${i}.salePrice`, Number(bulk.salePrice), { shouldDirty: true });
                            if (bulk.cost) setValue(`variants.${i}.cost`, Number(bulk.cost), { shouldDirty: true });
                          });
                          setBulk({ price: "", salePrice: "", cost: "" });
                          toast.success("Aplicado a todas las variantes");
                        }}
                      >
                        Aplicar
                      </Button>
                    </div>
                  </div>
                ) : null}

                  <div className="space-y-3">
                    {variants.fields.map((v, i) => {
                      const err = formState.errors.variants?.[i];
                      const wv = watchedVariants[i];
                      const name = Object.values(wv?.optionValues ?? {}).join(" / ");
                      const moreFields = (
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                          <Field label="SKU" htmlFor={`v-${i}-sku`} error={err?.sku?.message} className="col-span-2">
                            <Input id={`v-${i}-sku`} {...form.register(`variants.${i}.sku`)} invalid={!!err?.sku} readOnly={readOnly} autoCapitalize="characters" />
                          </Field>
                          <Field label="Código de barras" htmlFor={`v-${i}-barcode`}>
                            <Input id={`v-${i}-barcode`} {...form.register(`variants.${i}.barcode`)} className="tabular" readOnly={readOnly} placeholder="Opcional" inputMode="numeric" />
                          </Field>
                          <Field label="Peso (g)" htmlFor={`v-${i}-weight`}>
                            <Input id={`v-${i}-weight`} type="number" inputMode="numeric" {...form.register(`variants.${i}.weightGrams`, optionalNumber)} readOnly={readOnly} placeholder="Opcional" />
                          </Field>
                        </div>
                      );
                      return (
                        <div key={v._k} className={cn("rounded-md border border-border", !wv?.active && "opacity-60")}>
                          {hasOptions ? (
                            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
                              <span className="min-w-0 truncate font-semibold">{name || `Variante ${i + 1}`}</span>
                              <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                                Activa
                                <Controller control={control} name={`variants.${i}.active`} render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} aria-label={`Variante ${name} activa`} />} />
                              </label>
                            </div>
                          ) : null}
                          <div className="space-y-3 p-3">
                            {hasOptions ? (
                              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                <Field label="Precio" htmlFor={`v-${i}-price`} error={err?.price?.message}>
                                  <Input id={`v-${i}-price`} type="number" inputMode="numeric" prefix="$" {...form.register(`variants.${i}.price`)} invalid={!!err?.price} readOnly={readOnly} />
                                </Field>
                                <Field label="Con descuento" htmlFor={`v-${i}-sale`} error={err?.salePrice?.message}>
                                  <Input id={`v-${i}-sale`} type="number" inputMode="numeric" prefix="$" {...form.register(`variants.${i}.salePrice`, optionalNumber)} invalid={!!err?.salePrice} readOnly={readOnly} placeholder="—" />
                                </Field>
                                <Field label="Costo" htmlFor={`v-${i}-cost`}>
                                  <Input id={`v-${i}-cost`} type="number" inputMode="numeric" prefix="$" {...form.register(`variants.${i}.cost`, optionalNumber)} readOnly={readOnly} placeholder="—" />
                                </Field>
                                <Field label={isNew ? "Stock inicial" : "Disponible"}>
                                  {isNew ? <InitialStockInput control={control} index={i} locations={locations.data} /> : <div className="flex h-10 items-center"><VariantAvailable variantId={wv?.id} /></div>}
                                </Field>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                <Field label={isNew ? "Stock inicial" : "Disponible"} className="col-span-2 md:col-span-1">
                                  {isNew ? <InitialStockInput control={control} index={i} locations={locations.data} /> : <div className="flex h-10 items-center"><VariantAvailable variantId={wv?.id} /></div>}
                                </Field>
                              </div>
                            )}
                            {hasOptions ? <Profit price={wv?.price} salePrice={wv?.salePrice} cost={wv?.cost} /> : null}
                            {hasOptions ? (
                              <details className="group" open={!!err?.sku || undefined}>
                                <summary className="cursor-pointer list-none text-sm font-medium text-[#005BD3] [&::-webkit-details-marker]:hidden">
                                  <span className="group-open:hidden">Más datos (SKU {wv?.sku ? <span className="tabular">{wv.sku}</span> : null}, código, peso)</span>
                                  <span className="hidden group-open:inline">Ocultar datos</span>
                                </summary>
                                <div className="mt-3">{moreFields}</div>
                              </details>
                            ) : (
                              moreFields
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                {isNew && locations.data ? <p className="mt-3 text-sm text-muted-foreground">El stock inicial se registra en “{(locations.data.find((l) => l.isDefault) ?? locations.data[0])?.name}” como un ajuste con motivo “Stock inicial”. Podrás añadir stock en otras ubicaciones desde Inventario.</p> : null}
                {formState.errors.variants?.root?.message || (typeof formState.errors.variants?.message === "string" ? formState.errors.variants.message : null) ? <p className="mt-2 text-sm text-destructive">{formState.errors.variants?.root?.message ?? (formState.errors.variants?.message as string)}</p> : null}
              </Card>
            </>
          }
          aside={
            <>
              <Card title="Estado">
                <SelectField control={control} name="status" options={[{ value: "ACTIVE", label: "Activo" }, { value: "DRAFT", label: "Borrador" }, { value: "ARCHIVED", label: "Archivado" }]} help="Solo los productos activos se pueden vender." />
                {!isNew && totalAvailable !== undefined ? <p className="mt-3 text-sm text-muted-foreground"><Qty value={totalAvailable} /> unidades disponibles en total.</p> : null}
              </Card>
              <Card title="Organización">
                <div className="space-y-4">
                  <div>
                    <SelectField control={control} name="categoryId" label="Categoría" options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))} allowEmpty emptyLabel="Sin categoría" />
                    {!readOnly ? (
                      <div className="mt-2 flex gap-2">
                        <Input placeholder="Nueva categoría" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="h-9 sm:h-8" />
                        <Button type="button" size="sm" variant="secondary" disabled={!newCategory.trim()} onClick={async () => { try { const c = await api.post<{ id: string }>(v1("/categories"), { name: newCategory.trim() }); await invalidate("categories"); setValue("categoryId", c.id, { shouldDirty: true }); setNewCategory(""); } catch { toast.error("No se pudo crear la categoría"); } }}>Crear</Button>
                      </div>
                    ) : null}
                  </div>
                  <SelectField control={control} name="supplierId" label="Proveedor" options={(suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name }))} allowEmpty emptyLabel="Sin proveedor" />
                  <Field label="Etiquetas" htmlFor="tags" help="Separa con coma o Enter.">
                    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-card p-1.5 focus-within:ring-2 focus-within:ring-ring">
                      {watchedTags.map((t) => (
                        <Badge key={t} tone="neutral" className="h-7 gap-1 pr-1 text-sm">
                          {t}
                          {!readOnly ? <button type="button" onClick={() => setValue("tags", watchedTags.filter((x) => x !== t), { shouldDirty: true })} className="rounded p-0.5 hover:bg-black/10" aria-label={`Quitar ${t}`}><X className="h-3 w-3" /></button> : null}
                        </Badge>
                      ))}
                      {!readOnly ? (
                        <input id="tags" className="h-7 min-w-[80px] flex-1 bg-transparent px-1 text-base outline-none" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) { e.preventDefault(); const t = tagInput.trim().replace(/,$/, ""); if (t && !watchedTags.includes(t)) setValue("tags", [...watchedTags, t], { shouldDirty: true }); setTagInput(""); } }} onBlur={() => { const t = tagInput.trim(); if (t && !watchedTags.includes(t)) setValue("tags", [...watchedTags, t], { shouldDirty: true }); setTagInput(""); }} placeholder={watchedTags.length ? "" : "verano, básicos"} />
                      ) : null}
                    </div>
                  </Field>
                </div>
              </Card>
              {!isNew && product.data ? (
                <Card title="Inventario por variante" padded={false}>
                  <ul className="divide-y divide-border">
                    {product.data.variants.map((v) => (
                      <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2 text-base">
                        <span className="min-w-0 truncate">{v.title !== "Default" ? v.title : "Única"} <span className="text-sm text-muted-foreground tabular">{v.sku}</span></span>
                        <VariantAvailable variantId={v.id} link={`/inventario?q=${encodeURIComponent(v.sku)}`} />
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </>
          }
        />
      </form>
      <p className="sr-only">{watchedTitle}</p>
      {dialog}
    </Page>
  );
}

function Profit({ price, salePrice, cost, className }: { price?: number | null; salePrice?: number | null; cost?: number | null; className?: string }) {
  const sell = salePrice != null && price != null && salePrice < price ? salePrice : price ?? 0;
  if (!sell || cost == null || cost === 0) return null;
  const profit = sell - cost;
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      Ganancia por unidad: <Money value={profit} className={cn("font-medium", profit < 0 ? "text-destructive" : "text-foreground")} /> ({Math.round((profit / sell) * 100)} %)
      {salePrice != null && price != null && salePrice < price ? <span> · descuento del {Math.round((1 - salePrice / price) * 100)} %</span> : null}
    </p>
  );
}

function InitialStockInput({ control, index, locations, className }: { control: Control<Form>; index: number; locations?: { id: string; isDefault: boolean }[]; className?: string }) {
  const loc = locations?.find((l) => l.isDefault) ?? locations?.[0];
  return (
    <Controller
      control={control}
      name={`variants.${index}.initialStock`}
      render={({ field }) => {
        const cur = field.value?.find((s) => s.locationId === loc?.id)?.available ?? "";
        return <Input type="number" inputMode="numeric" min={0} className={className} aria-label="Stock inicial" placeholder="0" value={cur} onChange={(e) => field.onChange(loc ? [{ locationId: loc.id, available: Number(e.target.value || 0) }] : [])} />;
      }}
    />
  );
}

function VariantAvailable({ variantId, link }: { variantId?: string; link?: string }) {
  const q = useQuery({ queryKey: ["variant-levels", variantId], queryFn: () => api.get<{ data: { available: number; locationId: string }[] }>(v1("/inventory-levels"), { variant_id: variantId, limit: 50 }), enabled: !!variantId, staleTime: 30_000 });
  if (!variantId) return <span className="text-muted-foreground">—</span>;
  const total = q.data?.data.reduce((a, l) => a + l.available, 0);
  const el = <Qty value={total ?? null} className="font-medium" />;
  return link ? <a href={link} className="hover:underline">{el}</a> : el;
}
