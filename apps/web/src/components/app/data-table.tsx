import * as React from "react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowSelectionState, type SortingState, type OnChangeFn } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "./states";

export type DataTableProps<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  loading?: boolean;
  /** Fila clicable → navegar. */
  onRowClick?: (row: T) => void;
  getRowId?: (row: T) => string;
  /** Selección múltiple con acciones en lote. */
  selectable?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  bulkActions?: (selectedIds: string[], clear: () => void) => React.ReactNode;
  /** Ordenamiento controlado (servidor). */
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  /** Paginación por cursor. */
  pagination?: { hasMore: boolean; onNext: () => void; onPrev?: () => void; canPrev: boolean; total?: number; shown: number };
  empty?: React.ReactNode;
  /** Columnas a ocultar en móvil (ids). */
  mobileHidden?: string[];
  dense?: boolean;
  footer?: React.ReactNode;
};

export function DataTable<T>({ columns, data, loading, onRowClick, getRowId, selectable, rowSelection, onRowSelectionChange, bulkActions, sorting, onSortingChange, pagination, empty, mobileHidden = [], dense, footer }: DataTableProps<T>) {
  const allColumns = React.useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!selectable) return columns;
    const sel: ColumnDef<T, unknown> = {
      id: "__select",
      header: ({ table }) => <Checkbox aria-label="Seleccionar todo" checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false} onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)} />,
      cell: ({ row }) => <Checkbox aria-label="Seleccionar fila" checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)} onClick={(e) => e.stopPropagation()} />,
      size: 40,
      meta: { className: "hidden md:table-cell" },
    };
    return [sel, ...columns];
  }, [columns, selectable]);

  const table = useReactTable({
    data,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
    state: { rowSelection: rowSelection ?? {}, sorting: sorting ?? [] },
    onRowSelectionChange,
    onSortingChange,
    manualSorting: true,
    enableRowSelection: !!selectable,
    enableSortingRemoval: false,
  });

  const selectedIds = Object.keys(rowSelection ?? {}).filter((k) => rowSelection?.[k]);
  const hidden = (id: string) => (mobileHidden.includes(id) ? "hidden md:table-cell" : "");

  return (
    <div>
      {selectable && selectedIds.length > 0 && bulkActions ? (
        <div className="flex items-center gap-3 border-b border-border bg-surface-selected/60 px-4 py-2">
          <span className="text-base font-medium">
            {selectedIds.length} {selectedIds.length === 1 ? "seleccionado" : "seleccionados"}
          </span>
          <div className="flex flex-wrap items-center gap-2">{bulkActions(selectedIds, () => table.resetRowSelection())}</div>
        </div>
      ) : null}
      {loading && data.length === 0 ? (
        <TableSkeleton cols={Math.min(columns.length, 6)} />
      ) : data.length === 0 ? (
        <div>{empty}</div>
      ) : (
        <Table className={cn(loading && "opacity-60 transition-opacity")}>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => {
                  const meta = (h.column.columnDef.meta ?? {}) as { numeric?: boolean; className?: string };
                  const canSort = h.column.getCanSort() && !!onSortingChange;
                  const dir = h.column.getIsSorted();
                  return (
                    <TableHead key={h.id} numeric={meta.numeric} className={cn(hidden(h.column.id), meta.className)} style={h.getSize() !== 150 ? { width: h.getSize() } : undefined}>
                      {h.isPlaceholder ? null : canSort ? (
                        <button type="button" className={cn("inline-flex items-center gap-1 rounded-sm hover:text-foreground", meta.numeric && "flex-row-reverse")} onClick={h.column.getToggleSortingHandler()}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {dir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : dir === "desc" ? <ArrowDown className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} interactive={!!onRowClick} selected={row.getIsSelected()} onClick={onRowClick ? () => onRowClick(row.original) : undefined} className={cn(dense && "[&>td]:h-11 [&>td]:py-1.5")}>
                {row.getVisibleCells().map((cell) => {
                  const meta = (cell.column.columnDef.meta ?? {}) as { numeric?: boolean; className?: string };
                  return (
                    <TableCell key={cell.id} numeric={meta.numeric} className={cn(hidden(cell.column.id), meta.className)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {footer}
      {pagination && data.length > 0 ? (
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <span className="text-sm text-muted-foreground tabular">
            {pagination.total !== undefined ? `${pagination.shown} de ${pagination.total.toLocaleString("es-CO")}` : `${pagination.shown} resultados`}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="icon-sm" onClick={pagination.onPrev} disabled={!pagination.canPrev} aria-label="Página anterior">
              <ChevronLeft />
            </Button>
            <Button variant="secondary" size="icon-sm" onClick={pagination.onNext} disabled={!pagination.hasMore} aria-label="Página siguiente">
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Mantiene una pila de cursores para poder volver atrás con paginación por cursor. */
export function useCursorPagination(resetKey: string) {
  const [stack, setStack] = React.useState<string[]>([]);
  const cursor = stack[stack.length - 1];
  React.useEffect(() => {
    setStack([]);
  }, [resetKey]);
  return {
    cursor,
    canPrev: stack.length > 0,
    next: (c: string | null) => c && setStack((s) => [...s, c]),
    prev: () => setStack((s) => s.slice(0, -1)),
    reset: () => setStack([]),
  };
}
