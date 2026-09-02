import type { ApiErrorBody } from "@shared/types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorBody["error"]["code"] | "network_error";
  readonly issues?: unknown[];

  constructor(status: number, code: ApiError["code"], message: string, issues?: unknown[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

/** Fired on any 401 so the auth gate can drop the cached session and show sign-in. */
export const UNAUTHORIZED_EVENT = "opsec:unauthorized";

export async function parseError(res: Response): Promise<ApiError> {
  if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  let body: Partial<ApiErrorBody> | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    /* non-JSON error body */
  }
  const err = body?.error;
  return new ApiError(res.status, err?.code ?? "internal", err?.message ?? `Request failed (${res.status})`, err?.issues);
}

async function request<T>(method: string, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...init,
    });
  } catch (e) {
    throw new ApiError(0, "network_error", e instanceof Error ? e.message : "Network error");
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function toQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T = void>(path: string) => request<T>("DELETE", path),
  async upload<T>(path: string, form: FormData): Promise<T> {
    let res: Response;
    try {
      res = await fetch(path, { method: "POST", body: form });
    } catch (e) {
      throw new ApiError(0, "network_error", e instanceof Error ? e.message : "Network error");
    }
    if (!res.ok) throw await parseError(res);
    return (await res.json()) as T;
  },
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}
