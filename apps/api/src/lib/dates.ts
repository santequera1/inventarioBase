import { TIMEZONE, toBogotaDateString } from "@inventario/shared";

/** Convierte YYYY-MM-DD (Bogotá) al instante UTC de inicio del día. */
export function startOfBogotaDay(dateStr: string): Date {
  // Bogotá no tiene horario de verano: UTC-5 fijo.
  return new Date(`${dateStr}T00:00:00-05:00`);
}
export function endOfBogotaDay(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999-05:00`);
}

export function parseRange(from?: string, to?: string, defaultDays = 30): { from: Date; to: Date; fromStr: string; toStr: string } {
  const toStr = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : toBogotaDateString();
  let fromStr: string;
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) fromStr = from;
  else {
    const d = startOfBogotaDay(toStr);
    d.setUTCDate(d.getUTCDate() - (defaultDays - 1));
    fromStr = toBogotaDateString(d);
  }
  return { from: startOfBogotaDay(fromStr), to: endOfBogotaDay(toStr), fromStr, toStr };
}

export function parseDateInput(value: string | undefined, end = false): Date | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return end ? endOfBogotaDay(value) : startOfBogotaDay(value);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export { TIMEZONE };
