import * as React from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Input, type InputProps } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Etiqueta encima del campo, ayuda y error con instrucción clara. */
export function Field({ label, htmlFor, help, error, required, children, className, inline }: { label?: React.ReactNode; htmlFor?: string; help?: React.ReactNode; error?: string; required?: boolean; children: React.ReactNode; className?: string; inline?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", inline && "flex-row items-center justify-between gap-4", className)}>
      {label ? (
        <Label htmlFor={htmlFor} className={cn(inline && "order-1")}>
          {label}
          {required ? <span className="ml-0.5 text-muted-foreground" aria-hidden>*</span> : null}
        </Label>
      ) : null}
      <div className={cn("min-w-0", inline && "order-2")}>{children}</div>
      {help && !error ? <p className="text-sm text-muted-foreground">{help}</p> : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormRow({ children, className, cols = 2 }: { children: React.ReactNode; className?: string; cols?: 1 | 2 | 3 | 4 }) {
  return <div className={cn("grid gap-4", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3", cols === 4 && "sm:grid-cols-4", className)}>{children}</div>;
}

export function TextField<T extends FieldValues>({ control, name, label, help, required, inputProps, className, parse }: { control: Control<T>; name: FieldPath<T>; label?: React.ReactNode; help?: React.ReactNode; required?: boolean; inputProps?: InputProps; className?: string; parse?: "int" | "money" | "text" }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field label={label} htmlFor={name} help={help} error={fieldState.error?.message} required={required} className={className}>
          <Input
            id={name}
            {...inputProps}
            invalid={!!fieldState.error}
            value={field.value === null || field.value === undefined ? "" : (field.value as string | number)}
            onChange={(e) => {
              const v = e.target.value;
              if (parse === "int" || parse === "money") field.onChange(v === "" ? null : Number(v.replace(/[^\d-]/g, "")));
              else field.onChange(v);
            }}
            onBlur={field.onBlur}
            ref={field.ref}
            type={parse === "int" || parse === "money" ? "number" : inputProps?.type}
            inputMode={parse === "int" || parse === "money" ? "numeric" : inputProps?.inputMode}
          />
        </Field>
      )}
    />
  );
}

export function TextareaField<T extends FieldValues>({ control, name, label, help, required, rows, placeholder, className }: { control: Control<T>; name: FieldPath<T>; label?: React.ReactNode; help?: React.ReactNode; required?: boolean; rows?: number; placeholder?: string; className?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field label={label} htmlFor={name} help={help} error={fieldState.error?.message} required={required} className={className}>
          <Textarea id={name} rows={rows} placeholder={placeholder} invalid={!!fieldState.error} value={(field.value as string) ?? ""} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} />
        </Field>
      )}
    />
  );
}

export function SelectField<T extends FieldValues>({ control, name, label, help, required, options, placeholder, className, allowEmpty, emptyLabel = "Ninguno", numeric }: { control: Control<T>; name: FieldPath<T>; label?: React.ReactNode; help?: React.ReactNode; required?: boolean; options: { value: string; label: string }[]; placeholder?: string; className?: string; allowEmpty?: boolean; emptyLabel?: string; numeric?: boolean }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field label={label} htmlFor={name} help={help} error={fieldState.error?.message} required={required} className={className}>
          <Select value={field.value === null || field.value === undefined ? (allowEmpty ? "__none" : "") : String(field.value)} onValueChange={(v) => field.onChange(v === "__none" ? null : numeric ? Number(v) : v)}>
            <SelectTrigger id={name} invalid={!!fieldState.error}>
              <SelectValue placeholder={placeholder ?? "Selecciona…"} />
            </SelectTrigger>
            <SelectContent>
              {allowEmpty ? <SelectItem value="__none">{emptyLabel}</SelectItem> : null}
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    />
  );
}

/** Barra contextual "Cambios sin guardar — Descartar / Guardar". */
export function UnsavedBar({ visible, onDiscard, onSave, saving, label = "Cambios sin guardar" }: { visible: boolean; onDiscard: () => void; onSave: () => void; saving?: boolean; label?: string }) {
  return (
    <div className={cn("pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-4 transition-transform duration-200", visible ? "translate-y-2" : "-translate-y-20")} aria-hidden={!visible}>
      <div className="pointer-events-auto flex w-full max-w-[1200px] items-center justify-between gap-3 rounded-lg bg-[#1a1a1a] px-4 py-2.5 text-white shadow-popover">
        <span className="text-base font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onDiscard} disabled={saving} className="h-8 rounded-md px-3 text-base font-medium text-white/90 hover:bg-white/10 disabled:opacity-50">
            Descartar
          </button>
          <button type="button" onClick={onSave} disabled={saving} className="h-8 rounded-md bg-white px-3 text-base font-medium text-[#303030] hover:bg-white/90 disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
