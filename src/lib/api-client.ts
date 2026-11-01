"use client";

/** Typed fetch wrapper for the app's own API routes. */
export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
      credentials: "same-origin",
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiClientError(0, "NETWORK", "Network error. Check your connection and try again.");
  }
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
  if (!res.ok) {
    const e = data?.error;
    throw new ApiClientError(res.status, e?.code ?? "HTTP_ERROR", e?.message ?? `Request failed (HTTP ${res.status}).`, e?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string, signal?: AbortSignal) => request<T>("GET", url, undefined, signal),
  post: <T>(url: string, body?: unknown, signal?: AbortSignal) => request<T>("POST", url, body ?? {}, signal),
  put: <T>(url: string, body: unknown, signal?: AbortSignal) => request<T>("PUT", url, body, signal),
  patch: <T>(url: string, body: unknown, signal?: AbortSignal) => request<T>("PATCH", url, body, signal),
  delete: <T>(url: string) => request<T>("DELETE", url),
};

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
