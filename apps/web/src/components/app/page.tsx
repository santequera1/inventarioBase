import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Contenedor de página: título a la izquierda, UNA acción principal a la derecha; márgenes compartidos. */
export function Page({ children, className, width = "default" }: { children: React.ReactNode; className?: string; width?: "default" | "narrow" | "wide" | "full" }) {
  return (
    <div className={cn("mx-auto w-full px-4 py-5 sm:px-6 sm:py-6", width === "default" && "max-w-[1200px]", width === "narrow" && "max-w-[760px]", width === "wide" && "max-w-[1440px]", width === "full" && "max-w-none", className)}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, backTo, primaryAction, secondaryActions, badge, className }: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  backTo?: string;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-2">
        {backTo ? (
          <Button asChild variant="ghost" size="icon-sm" className="mt-0.5 -ml-2 shrink-0" aria-label="Volver">
            <Link to={backTo}>
              <ArrowLeft />
            </Link>
          </Button>
        ) : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-title truncate">{title}</h1>
            {badge}
          </div>
          {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {(primaryAction || secondaryActions) && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          {secondaryActions}
          {primaryAction}
        </div>
      )}
    </div>
  );
}

export function Card({ children, className, title, description, actions, padded = true }: { children: React.ReactNode; className?: string; title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; padded?: boolean }) {
  return (
    <section className={cn("surface", className)}>
      {title || actions ? (
        <header className={cn("flex items-start justify-between gap-3 px-4 pt-4 sm:px-5", padded ? "pb-1" : "border-b border-border pb-3")}>
          <div className="min-w-0">
            {title ? <h2 className="section-title">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn(padded && "px-4 py-4 sm:px-5")}>{children}</div>
    </section>
  );
}

export function TwoColumn({ main, aside }: { main: React.ReactNode; aside: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">{main}</div>
      <div className="flex min-w-0 flex-col gap-4">{aside}</div>
    </div>
  );
}

export function KeyValue({ items, className }: { items: { label: React.ReactNode; value: React.ReactNode; numeric?: boolean }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-border", className)}>
      {items.map((it, i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
          <dt className="text-muted-foreground">{it.label}</dt>
          <dd className={cn("text-right font-medium", it.numeric && "tabular")}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
