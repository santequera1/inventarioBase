import { Link } from "react-router-dom";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Thumb({ src, alt, size = "md", className }: { src: string | null | undefined; alt?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const s = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-16 w-16" : "h-10 w-10";
  return (
    <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground", s, className)}>
      {src ? <img src={src} alt={alt ?? ""} className="h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="h-4 w-4" />}
    </div>
  );
}

/** Producto y variante juntos en una celda, con miniatura. */
export function ProductCell({ title, variantTitle, sku, thumbUrl, to, compact, inactive }: { title: string; variantTitle?: string | null; sku?: string | null; thumbUrl?: string | null; to?: string; compact?: boolean; inactive?: boolean }) {
  const showVariant = variantTitle && variantTitle !== "Default";
  const content = (
    <div className="flex min-w-0 items-center gap-3">
      <Thumb src={thumbUrl} alt={title} size={compact ? "sm" : "md"} />
      <div className="min-w-0">
        <div className={cn("truncate font-medium leading-5", inactive && "text-muted-foreground", to && "group-hover:underline underline-offset-2")}>{title}</div>
        {(showVariant || sku) && (
          <div className="truncate text-sm leading-4 text-muted-foreground">
            {showVariant ? <span>{variantTitle}</span> : null}
            {showVariant && sku ? <span className="mx-1.5 text-border">·</span> : null}
            {sku ? <span className="tabular">{sku}</span> : null}
          </div>
        )}
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="group block min-w-0 text-foreground" onClick={(e) => e.stopPropagation()}>
      {content}
    </Link>
  ) : (
    content
  );
}
