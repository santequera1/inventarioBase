import * as React from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirmar", destructive, onConfirm, loading }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: React.ReactNode; confirmLabel?: string; destructive?: boolean; onConfirm: () => void | Promise<void>; loading?: boolean }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription asChild><div>{description}</div></AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            destructive={destructive}
            disabled={loading}
            onClick={(e) => {
              e.preventDefault();
              void onConfirm();
            }}
          >
            {loading ? "Procesando…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function useConfirm() {
  const [state, setState] = React.useState<{ open: boolean; title: string; description?: React.ReactNode; confirmLabel?: string; destructive?: boolean; resolve?: (v: boolean) => void }>({ open: false, title: "" });
  const confirm = React.useCallback((opts: { title: string; description?: React.ReactNode; confirmLabel?: string; destructive?: boolean }) => new Promise<boolean>((resolve) => setState({ open: true, ...opts, resolve })), []);
  const dialog = (
    <ConfirmDialog
      open={state.open}
      onOpenChange={(o) => {
        if (!o) {
          state.resolve?.(false);
          setState((s) => ({ ...s, open: false }));
        }
      }}
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel}
      destructive={state.destructive}
      onConfirm={() => {
        state.resolve?.(true);
        setState((s) => ({ ...s, open: false }));
      }}
    />
  );
  return { confirm, dialog };
}
