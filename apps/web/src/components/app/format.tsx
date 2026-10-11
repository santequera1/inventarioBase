import * as React from "react";
import { formatCOP, formatDate, formatDateTime, formatInt, formatSigned } from "@inventario/shared";
import { cn } from "@/lib/utils";

export function Money({ value, className, signed }: { value: number | null | undefined; className?: string; signed?: boolean }) {
  const text = value === null || value === undefined ? "—" : signed && value > 0 ? `+${formatCOP(value)}` : formatCOP(value);
  return <span className={cn("tabular", className)}>{text}</span>;
}

export function Qty({ value, className, signed, zeroDim }: { value: number | null | undefined; className?: string; signed?: boolean; zeroDim?: boolean }) {
  if (value === null || value === undefined) return <span className={cn("tabular text-muted-foreground", className)}>—</span>;
  return <span className={cn("tabular", zeroDim && value === 0 && "text-muted-foreground", signed && value > 0 && "text-tone-success-fg", signed && value < 0 && "text-foreground", className)}>{signed ? formatSigned(value) : formatInt(value)}</span>;
}

export function DateText({ value, time = false, className }: { value: string | null | undefined; time?: boolean; className?: string }) {
  if (!value) return <span className={cn("text-muted-foreground", className)}>—</span>;
  return (
    <time dateTime={value} className={cn("tabular whitespace-nowrap", className)} title={formatDateTime(value)}>
      {time ? formatDateTime(value) : formatDate(value)}
    </time>
  );
}

export function RelativeDate({ value }: { value: string }) {
  const d = new Date(value);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  let text: string;
  if (mins < 1) text = "hace un momento";
  else if (mins < 60) text = `hace ${mins} min`;
  else if (mins < 60 * 24) text = `hace ${Math.round(mins / 60)} h`;
  else if (mins < 60 * 24 * 7) text = `hace ${Math.round(mins / 1440)} d`;
  else text = formatDate(value);
  return (
    <time dateTime={value} title={formatDateTime(value)} className="whitespace-nowrap">
      {text}
    </time>
  );
}
