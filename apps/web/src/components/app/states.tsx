import * as React from "react";
import { AlertCircle, PackageOpen, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export function EmptyState({ icon, title, description, action, compact, className }: { icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode; compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:h-5 [&_svg]:w-5">{icon ?? <PackageOpen />}</div>
      <h3 className="text-md font-semibold">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-base text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4 flex gap-2">{action}</div> : null}
    </div>
  );
}

export function NoResults({ onClear }: { onClear?: () => void }) {
  return <EmptyState compact icon={<SearchX />} title="Sin resultados" description="Prueba con otros términos o quita algún filtro." action={onClear ? <Button variant="secondary" onClick={onClear}>Limpiar filtros</Button> : undefined} />;
}

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const msg = error instanceof ApiError ? error.problem.detail ?? error.problem.title : error instanceof Error ? error.message : "Ocurrió un error inesperado.";
  const status = error instanceof ApiError ? error.status : undefined;
  return (
    <EmptyState
      compact={compact}
      icon={<AlertCircle />}
      title={status === 403 ? "Sin permiso" : status === 404 ? "No encontrado" : "No se pudo cargar"}
      description={msg}
      action={onRetry && status !== 403 && status !== 404 ? <Button variant="secondary" onClick={onRetry}>Reintentar</Button> : undefined}
    />
  );
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex h-13 items-center gap-4 px-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn("h-4", c === 0 ? "w-[32%]" : c === cols - 1 ? "ml-auto w-16" : "w-20")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="surface">
        <TableSkeleton />
      </div>
    </div>
  );
}
