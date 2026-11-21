// Typed fetch client for the RoleFold API (TRD §11.2). Works on the server (calls API_URL directly)
// and in the browser (calls /v1, which next.config rewrites to API_URL, so there's no CORS).
import { redirect } from "next/navigation";

export const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";
// DEV-ONLY identity (api/app/core/auth.py). Production signs in with OIDC: the session cookie becomes a bearer
// token (server loaders pass it in `headers`; src/proxy.ts adds it to browser /v1 calls).
export const DEV_USER = process.env.NEXT_PUBLIC_DEV_USER;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export type Operation = {
  id: string;
  type: string;
  state: "queued" | "running" | "succeeded" | "failed" | "canceled";
  result: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
};

const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type Init = { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown; headers?: Record<string, string> };

async function send(path: string, init: Init): Promise<Response> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = { ...init.headers };
  if (DEV_USER) headers["X-Dev-User"] = DEV_USER;
  if (method !== "GET") headers["Idempotency-Key"] = newKey();
  const form = init.body instanceof FormData;
  // FormData sets its own multipart boundary header.
  if (init.body !== undefined && !form) headers["Content-Type"] = "application/json";
  try {
    return await fetch(`${typeof window === "undefined" ? API_URL : ""}/v1${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : form ? (init.body as FormData) : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, "UNREACHABLE", "We couldn’t reach RoleFold just now. Check your connection and try again.");
  }
}

async function fail(res: Response): Promise<never> {
  // Session expired or revoked: sign in again (a dev user's 401 is a config error, so it stays visible).
  if (res.status === 401 && !DEV_USER) {
    if (typeof window !== "undefined") window.location.replace(`/signin?next=${encodeURIComponent(location.pathname + location.search)}`);
    else if (process.env.OIDC_ISSUER) redirect("/signin");
  }
  const e = (await res.json().catch(() => null))?.error;
  throw new ApiError(res.status, e?.code ?? "INTERNAL_ERROR", e?.message ?? "Something went wrong on our side. Try again in a moment.", e?.details);
}

/** GET when there's no body; anything else sends an Idempotency-Key (one per call: callers disable the button while pending). JSON, or FormData for uploads. */
export async function api<T>(path: string, init: Init = {}): Promise<T> {
  const res = await send(path, init);
  if (!res.ok) return fail(res);
  return (await res.json().catch(() => null)) as T;
}

/** Fetch an attachment with the auth header and hand it to the browser as a download (a plain link can't send X-Dev-User; the bearer comes from src/proxy.ts). */
export async function download(path: string, fallbackName: string) {
  const res = await send(path, {});
  if (!res.ok) return fail(res);
  const name = res.headers.get("Content-Disposition")?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1];
  const url = URL.createObjectURL(await res.blob());
  const link = Object.assign(document.createElement("a"), { href: url, download: name ? decodeURIComponent(name) : fallbackName });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** POST /resumes/{id}/export -> wait -> download. Exports are never blocked by plan limits. */
export async function exportResume(resumeId: string, format: "pdf" | "docx", template: string) {
  const r = await api<{ operation: Operation }>(`/resumes/${resumeId}/export`, { method: "POST", body: { format, template } });
  const op = await waitFor(r.operation);
  await download(`/exports/${op.result?.export_id}/download`, `resume.${format}`);
}

/** Poll GET /v1/tasks/{id} with backoff (0.5s → 4s) until it settles. Throws ApiError on failure or timeout. */
export async function waitFor(op: Operation, timeoutMs = 120_000, onUpdate?: (op: Operation) => void): Promise<Operation> {
  const end = Date.now() + timeoutMs;
  for (let delay = 500; ; delay = Math.min(delay * 1.5, 4000)) {
    onUpdate?.(op);
    if (op.state === "succeeded") return op;
    if (op.state === "failed" || op.state === "canceled")
      throw new ApiError(0, op.error?.code ?? "INTERNAL_ERROR", op.error?.message ?? "This didn’t finish, so it wasn’t counted against your limit. Try again.");
    if (Date.now() > end) throw new ApiError(0, "TIMEOUT", "This is taking longer than usual. It will keep going; check back in a minute.");
    await new Promise((r) => setTimeout(r, delay));
    try {
      op = await api<Operation>(`/tasks/${op.id}`);
    } catch (e) {
      // A dropped status check (network blip, proxy 5xx) isn't a failed task: keep polling until the timeout.
      if (!(e instanceof ApiError) || (e.status !== 0 && e.status < 500)) throw e;
    }
  }
}
