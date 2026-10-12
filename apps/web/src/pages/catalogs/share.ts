import { toast } from "sonner";

export const catalogUrl = (slug: string) => `${window.location.origin}/catalogo/${slug}`;

export async function copyCatalogLink(slug: string) {
  const url = catalogUrl(slug);
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Enlace copiado");
  } catch {
    window.prompt("Copia el enlace del catálogo:", url);
  }
}

/** Abre WhatsApp para compartir el enlace con quien el usuario elija. */
export function shareCatalogOnWhatsapp(name: string, slug: string) {
  const text = `Mira nuestro catálogo *${name}*: ${catalogUrl(slug)}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

export function formatPhone(digits: string) {
  if (digits.startsWith("57") && digits.length === 12) return `+57 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  return `+${digits}`;
}
