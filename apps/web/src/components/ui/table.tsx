import * as React from "react";
import { cn } from "@/lib/utils";

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-x-auto scrollbar-thin">
    <table ref={ref} className={cn("w-full caption-bottom text-base", className)} {...props} />
  </div>
));
Table.displayName = "Table";
const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b [&_tr]:border-border", className)} {...props} />);
TableHeader.displayName = "TableHeader";
const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />);
TableBody.displayName = "TableBody";
const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => <tfoot ref={ref} className={cn("border-t border-border bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />);
TableFooter.displayName = "TableFooter";
const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean; selected?: boolean }>(({ className, interactive, selected, ...props }, ref) => (
  <tr ref={ref} className={cn("border-b border-border transition-colors", interactive && "cursor-pointer hover:bg-surface-hover", selected && "bg-surface-selected/60", className)} {...props} />
));
TableRow.displayName = "TableRow";
const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }>(({ className, numeric, ...props }, ref) => (
  <th ref={ref} className={cn("h-10 px-3 text-left align-middle text-sm font-medium text-muted-foreground first:pl-4 last:pr-4 [&:has([role=checkbox])]:w-10 [&:has([role=checkbox])]:pr-0", numeric && "text-right", className)} {...props} />
));
TableHead.displayName = "TableHead";
const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }>(({ className, numeric, ...props }, ref) => (
  <td ref={ref} className={cn("h-13 px-3 py-2 align-middle first:pl-4 last:pr-4 [&:has([role=checkbox])]:pr-0", numeric && "tabular text-right", className)} {...props} />
));
TableCell.displayName = "TableCell";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell };
