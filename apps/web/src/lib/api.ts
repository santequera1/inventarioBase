import type { Problem } from "@inventario/shared";

export class ApiError extends Error {
  status: number;
  problem: Problem;
  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.status = problem.status;
    this.problem = problem;
  }
  /** Mapa path → mensaje, útil para pintar errores de formulario. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of this.problem.errors ?? []) out[e.path.replace(/^body\./, "")] = e.message;
    return out;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function qs(params?: Query): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: string, url: string, body?: unknown, opts: { idempotencyKey?: string; raw?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers["content-type"] = "application/json";
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
  const res = await fetch(url, { method, headers, credentials: "include", body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
  if (res.status === 401 && !url.startsWith("/api/auth/login")) onUnauthorized?.();
  if (!res.ok) {
    let problem: Problem;
    try {
      problem = (await res.json()) as Problem;
    } catch {
      problem = { type: "about:blank", title: res.statusText || "Error", status: res.status, detail: "No se pudo completar la solicitud." };
    }
    throw new ApiError(problem);
  }
  if (opts.raw) return (await res.blob()) as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(url: string, params?: Query) => request<T>("GET", `${url}${qs(params)}`),
  post: <T>(url: string, body?: unknown, idempotencyKey?: string) => request<T>("POST", url, body, { idempotencyKey }),
  put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body),
  patch: <T>(url: string, body?: unknown) => request<T>("PATCH", url, body),
  delete: <T>(url: string) => request<T>("DELETE", url),
  blob: (url: string, params?: Query) => request<Blob>("GET", `${url}${qs(params)}`, undefined, { raw: true }),
  upload: <T>(url: string, form: FormData) => request<T>("POST", url, form),
};

export const v1 = (path: string) => `/api/v1${path}`;
