import { AIError } from "./types";

/** fetch with timeout + caller cancellation, mapping failures to AIError. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs: number; signal?: AbortSignal },
  labels: { provider: string; target: string },
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, init.timeoutMs);
  const onAbort = () => controller.abort();
  init.signal?.addEventListener("abort", onAbort);
  try {
    const { timeoutMs: _t, signal: _s, ...rest } = init;
    return await fetch(url, { ...rest, signal: controller.signal });
  } catch (err) {
    if (timedOut) {
      throw new AIError("TIMEOUT", `${labels.provider} did not respond within ${Math.round(init.timeoutMs / 1000)}s.`, { retryable: true, cause: err });
    }
    if (init.signal?.aborted) throw new AIError("CANCELLED", "The request was cancelled.", { cause: err });
    throw new AIError("CONNECTION_FAILED", `Could not reach ${labels.provider} at ${labels.target}.`, { retryable: true, cause: err });
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", onAbort);
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new AIError("CANCELLED", "The request was cancelled."));
    });
  });
}
