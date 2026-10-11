import * as React from "react";
import { useSearchParams } from "react-router-dom";

export function useDebounce<T>(value: T, delay = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** Estado sincronizado con la URL (?clave=valor) para filtros y pestañas. */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams();
  const state = React.useMemo(() => {
    const out = { ...defaults } as Record<string, string>;
    for (const k of Object.keys(defaults)) {
      const v = params.get(k);
      if (v !== null) out[k] = v;
    }
    return out as T;
  }, [params, defaults]);
  const set = React.useCallback(
    (patch: Partial<T>, opts: { replace?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === "" || v === defaults[k]) next.delete(k);
            else next.set(k, String(v));
          }
          if (!("cursor" in patch)) next.delete("cursor");
          return next;
        },
        { replace: opts.replace ?? true },
      );
    },
    [setParams, defaults],
  );
  return [state, set] as const;
}

const LOCATION_KEY = "iw.locationId";
export function useSelectedLocation(defaultId?: string | null) {
  const [id, setIdState] = React.useState<string>(() => localStorage.getItem(LOCATION_KEY) ?? defaultId ?? "");
  React.useEffect(() => {
    if (!id && defaultId) setIdState(defaultId);
  }, [defaultId, id]);
  const setId = React.useCallback((v: string) => {
    setIdState(v);
    if (v) localStorage.setItem(LOCATION_KEY, v);
    else localStorage.removeItem(LOCATION_KEY);
  }, []);
  return [id, setId] as const;
}

export function useMediaQuery(q: string) {
  const [m, setM] = React.useState(() => (typeof window !== "undefined" ? window.matchMedia(q).matches : false));
  React.useEffect(() => {
    const mq = window.matchMedia(q);
    const fn = () => setM(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [q]);
  return m;
}

export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void) {
  React.useEffect(() => {
    const [mod, key] = combo.includes("+") ? combo.split("+") : [null, combo];
    const fn = (e: KeyboardEvent) => {
      const modOk = mod === "mod" ? e.metaKey || e.ctrlKey : mod === null ? !e.metaKey && !e.ctrlKey : true;
      if (modOk && e.key.toLowerCase() === key!.toLowerCase()) {
        const target = e.target as HTMLElement;
        if (mod === null && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
        e.preventDefault();
        handler(e);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [combo, handler]);
}
