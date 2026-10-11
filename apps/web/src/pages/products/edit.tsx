import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm, useFieldArray, Controller } from "react-hook-form";
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
  variants: z.array(variantInput.extend({ price: z.coerce.number().int().min(0, "Introduce un precio en COP (entero, sin decimales)"), cost: z.coerce.number().int().min(0).nullable().optional(), compareAtPrice: z.coerce.number().int().min(0).nullable().optional(), weightGrams: z.coerce.number().int().min(0).nullable().optional() })).min(1, "Añade al menos una variante"),
});
type Form = z.infer<typeof formSchema>;

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
    defaultValues: { title: "", description: "", status: "ACTIVE", categoryId: null, supplierId: null, tags: [], taxRate: 19, options: [], variants: [{ sku: "", price: 0, cost: null, compareAtPrice: null, barcode: "", weightGrams: null, optionValues: {}, trackInventory: true, active: true, initialStock: [] }], imageIds: [] },
  });
  const { control, watch, setValue, getValues, reset, formState } = form;
  const variants = useFieldArray({ control, name: "variants", keyName: "_k" });
  const options = useFieldArray({ control, name: "options", keyName: "_k" });
  const watchedOptions = watch("options");
  const watchedTags = watch("tags");
  const watchedVariants = watch("variants");
  const watchedTitle = watch("title");
  const hasOptions = watchedOptions.length > 0;

  React.useEffect(() => {
    const p = product.data;
    if (!p) return;
    reset({
      title: p.title, description: p.description ?? "", status: p.status, categoryId: p.categoryId, supplierId: p.supplierId, tags: p.tags, taxRate: p.taxRate as 0 | 5 | 19, options: p.options,
      variants: p.variants.map((v) => ({ id: v.id, title: v.title, sku: v.sku, barcode: v.barcode ?? "", price: v.price, compareAtPrice: v.compareAtPrice, cost: v.cost, weightGrams: v.weightGrams, optionValues: v.optionValues, position: v.position, trackInventory: v.trackInventory, active: v.active, imageId: v.imageId })),
      imageIds: p.images.map((i) => i.id),
    });
    setImages(p.images.map((i) => ({ id: i.id, url: i.url, thumbUrl: i.thumbUrl })));
  }, [product.data, reset]);

  /** Regenera variantes a partir de las opciones, conservando datos de las existentes. */
  const regenerateVariants = React.useCallback(() => {
    const opts = getValues("options").filter((o) => o.name.trim() && o.values.some(Boolean));
    const combos = cartesian(opts);
    const current = getValues("variants");
    const next = combos.map((ov, i) => {
      const key = JSON.stringify(ov);
      const existing = current.find((v) => JSON.stringify(v.optionValues) === key) ?? (combos.length === 1 ? current[0] : undefined);
      return existing ? { ...existing, optionValues: ov, position: i } : { sku: skuFrom(getValues("title") || "SKU", ov), price: current[0]?.price ?? 0, cost: current[0]?.cost ?? null, compareAtPrice: null, barcode: "", weightGrams: null, optionValues: ov, trackInventory: true, active: true, position: i, initialStock: [] };
    });
    setValue("variants", next, { shouldDirty: true });
  }, [getValues, setValue]);

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
      const payload = { ...values, description: values.description || null, variants: values.variants.map((v) => ({ ...v, barcode: v.barcode || null, initialStock: isNew ? v.initialStock?.filter((s) => s.available > 0) : undefined })) };
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
    () => toast.error("Revisa los campos marcados en rojo"),
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
                <FormRow cols={3}>
                  {!hasOptions ? <TextField control={control} name="variants.0.price" label="Precio" required parse="money" inputProps={{ prefix: "$", min: 0 }} /> : null}
                  {!hasOptions ? <TextField control={control} name="variants.0.compareAtPrice" label="Precio comparado" parse="money" help="Precio anterior tachado" inputProps={{ prefix: "$" }} /> : null}
                  {!hasOptions ? <TextField control={control} name="variants.0.cost" label="Costo por unidad" parse="money" inputProps={{ prefix: "$" }} /> : null}
                  <SelectField control={control} name="taxRate" label="IVA" options={[{ value: "0", label: "0 % (excluido / exento)" }, { value: "5", label: "5 %" }, { value: "19", label: "19 %" }]} />
                </FormRow>
                {!hasOptions && (watchedVariants[0]?.price ?? 0) > 0 && watchedVariants[0]?.cost ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Margen bruto: <Money value={(watchedVariants[0]!.price ?? 0) - (watchedVariants[0]!.cost ?? 0)} /> ({Math.round((((watchedVariants[0]!.price ?? 0) - (watchedVariants[0]!.cost ?? 0)) / (watchedVariants[0]!.price ?? 1)) * 100)} %)
                  </p>
                ) : null}
                <Controller control={control} name="taxRate" render={({ field }) => <input type="hidden" value={field.value} readOnly />} />
              </Card>

              <Card title="Variantes" description="Añade opciones como Talla o Color para generar variantes con SKU propio." actions={!readOnly ? <Button type="button" variant="secondary" size="sm" onClick={() => options.append({ name: options.fields.length === 0 ? "Talla" : "Color", values: [""] })} disabled={options.fields.length >= 3}><Plus /> Añadir opción</Button> : undefined}>
                {options.fields.length > 0 ? (
                  <div className="mb-4 space-y-3">
                    {options.fields.map((o, oi) => (
                      <div key={o._k} className="rounded-md border border-border p-3">
                        <div className="flex items-end gap-2">
                          <Field label="Nombre de la opción" className="flex-1" htmlFor={`opt-${oi}`}>
                            <Input id={`opt-${oi}`} {...form.register(`options.${oi}.name`)} placeholder="Talla" readOnly={readOnly} />
                          </Field>
                          {!readOnly ? <Button type="button" variant="ghost" size="icon" aria-label="Quitar opción" onClick={() => { options.remove(oi); setTimeout(regenerateVariants, 0); }}><Trash2 /></Button> : null}
                        </div>
                        <Controller
                          control={control}
                          name={`options.${oi}.values`}
                          render={({ field, fieldState }) => (
                            <Field label="Valores" className="mt-3" error={fieldState.error?.message} help="Escribe un valor y pulsa Enter.">
                              <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-card p-1.5 focus-within:ring-2 focus-within:ring-ring">
                                {field.value.filter(Boolean).map((v, vi) => (
                                  <Badge key={vi} tone="neutral" className="h-7 gap-1 pr-1 text-sm">
                                    {v}
                                    {!readOnly ? <button type="button" onClick={() => { field.onChange(field.value.filter((_, i) => i !== field.value.indexOf(v))); setTimeout(regenerateVariants, 0); }} className="rounded p-0.5 hover:bg-black/10" aria-label={`Quitar ${v}`}><X className="h-3 w-3" /></button> : null}
                                  </Badge>
                                ))}
                                {!readOnly ? (
                                  <input
                                    className="h-7 min-w-[100px] flex-1 bg-transparent px-1 text-base outline-none"
                                    placeholder={field.value.filter(Boolean).length ? "" : "S, M, L…"}
                                    onKeyDown={(e) => {
                                      const el = e.currentTarget;
                                      if ((e.key === "Enter" || e.key === ",") && el.value.trim()) {
                                        e.preventDefault();
                                        const vals = el.value.split(",").map((s) => s.trim()).filter(Boolean);
                                        field.onChange([...field.value.filter(Boolean), ...vals.filter((v) => !field.value.includes(v))]);
                                        el.value = "";
                                        setTimeout(regenerateVariants, 0);
                                      }
                                    }}
                                    onBlur={(e) => {
                                      const el = e.currentTarget;
                                      if (el.value.trim()) {
                                        field.onChange([...field.value.filter(Boolean), ...el.value.split(",").map((s) => s.trim()).filter((v) => v && !field.value.includes(v))]);
                                        el.value = "";
                                        setTimeout(regenerateVariants, 0);
                                      }
                                    }}
                                  />
                                ) : null}
                              </div>
                            </Field>
                          )}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="-mx-4 overflow-x-auto sm:-mx-5">
                  <table className="w-full text-base">
                    <thead className="text-sm text-muted-foreground">
                      <tr className="border-y border-border">
                        {hasOptions ? <th className="px-4 py-2 text-left font-medium sm:pl-5">Variante</th> : null}
                        <th className="px-3 py-2 text-left font-medium">SKU</th>
                        <th className="px-3 py-2 text-left font-medium">Código de barras</th>
                        {hasOptions ? <th className="px-3 py-2 text-right font-medium">Precio</th> : null}
                        {hasOptions ? <th className="px-3 py-2 text-right font-medium">Costo</th> : null}
                        <th className="px-3 py-2 text-right font-medium">Peso (g)</th>
                        {isNew ? <th className="px-3 py-2 text-right font-medium">Stock inicial</th> : <th className="px-3 py-2 text-right font-medium">Disponible</th>}
                        <th className="px-3 py-2 text-center font-medium sm:pr-5">Activa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {variants.fields.map((v, i) => {
                        const err = formState.errors.variants?.[i];
                        const pv = product.data?.variants.find((x) => x.id === watchedVariants[i]?.id);
                        return (
                          <tr key={v._k} className={cn(!watchedVariants[i]?.active && "opacity-60")}>
                            {hasOptions ? <td className="px-4 py-2 font-medium sm:pl-5">{Object.values(watchedVariants[i]?.optionValues ?? {}).join(" / ") || "—"}</td> : null}
                            <td className="px-3 py-2 min-w-[140px]"><Input {...form.register(`variants.${i}.sku`)} invalid={!!err?.sku} className="h-8" readOnly={readOnly} aria-label="SKU" />{err?.sku ? <p className="mt-1 text-xs text-destructive">{err.sku.message}</p> : null}</td>
                            <td className="px-3 py-2 min-w-[140px]"><Input {...form.register(`variants.${i}.barcode`)} className="h-8 tabular" readOnly={readOnly} aria-label="Código de barras" placeholder="Opcional" /></td>
                            {hasOptions ? <td className="px-3 py-2 w-[130px]"><Input type="number" {...form.register(`variants.${i}.price`)} invalid={!!err?.price} className="h-8" readOnly={readOnly} aria-label="Precio" /></td> : null}
                            {hasOptions ? <td className="px-3 py-2 w-[130px]"><Input type="number" {...form.register(`variants.${i}.cost`)} className="h-8" readOnly={readOnly} aria-label="Costo" /></td> : null}
                            <td className="px-3 py-2 w-[100px]"><Input type="number" {...form.register(`variants.${i}.weightGrams`)} className="h-8" readOnly={readOnly} aria-label="Peso en gramos" /></td>
                            <td className="px-3 py-2 w-[120px] text-right">
                              {isNew ? (
                                <Controller control={control} name={`variants.${i}.initialStock`} render={({ field }) => { const loc = locations.data?.find((l) => l.isDefault) ?? locations.data?.[0]; const cur = field.value?.find((s) => s.locationId === loc?.id)?.available ?? ""; return <Input type="number" min={0} className="h-8" aria-label="Stock inicial" value={cur} onChange={(e) => field.onChange(loc ? [{ locationId: loc.id, available: Number(e.target.value || 0) }] : [])} />; }} />
                              ) : (
                                <Qty value={pv ? (product.data?.totalAvailable !== undefined ? undefined : null) : null} className="hidden" />
                              )}
                              {!isNew ? <VariantAvailable variantId={watchedVariants[i]?.id} /> : null}
                            </td>
                            <td className="px-3 py-2 text-center sm:pr-5"><Controller control={control} name={`variants.${i}.active`} render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} aria-label="Variante activa" />} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
                        <Input placeholder="Nueva categoría" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="h-8" />
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

function VariantAvailable({ variantId, link }: { variantId?: string; link?: string }) {
  const q = useQuery({ queryKey: ["variant-levels", variantId], queryFn: () => api.get<{ data: { available: number; locationId: string }[] }>(v1("/inventory-levels"), { variant_id: variantId, limit: 50 }), enabled: !!variantId, staleTime: 30_000 });
  if (!variantId) return <span className="text-muted-foreground">—</span>;
  const total = q.data?.data.reduce((a, l) => a + l.available, 0);
  const el = <Qty value={total ?? null} className="font-medium" />;
  return link ? <a href={link} className="hover:underline">{el}</a> : el;
}
