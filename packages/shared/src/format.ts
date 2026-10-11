/** Utilidades de formato compartidas (COP, fechas en America/Bogota). */
const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** `$ 1.250.000` */
export function formatCOP(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return copFormatter.format(value).replace(/^\$\s?/, "$ ").replace(/^-\$\s?/, "-$ ");
}

const intFormatter = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return intFormatter.format(value);
}

export function formatSigned(value: number): string {
  if (value > 0) return `+${formatInt(value)}`;
  return formatInt(value);
}

export const TIMEZONE = "America/Bogota";

export function formatDate(value: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-CO", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: true }).format(d);
}

/** Devuelve YYYY-MM-DD para la fecha dada en Bogotá. */
export function toBogotaDateString(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
