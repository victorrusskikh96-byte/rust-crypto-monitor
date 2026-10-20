import type { Dashboard, Quantities, SafeError, Valuation } from './contracts';
import { decodeDashboard, decodeErrorEnvelope, decodeValuation } from './decode';

// Rust: 5s request reading + 25s response; Vite: fixed 30s proxy budgets.
// Refresh must allow that window. These bounds include response body consumption.
export const GET_DEADLINE_MS = 10_000;
export const REFRESH_DEADLINE_MS = 35_000;
export const VALUATION_DEADLINE_MS = 35_000;
type ErrorKind = 'disconnected' | 'invalid_response' | 'http_error' | 'aborted' | 'timeout';

export class ApiClientError extends Error {
  constructor(
    public readonly kind: ErrorKind,
    public readonly status?: number,
    public readonly safeError?: SafeError,
    public readonly retryAfterMs: string | null = null,
  ) {
    super('The local API snapshot is unavailable');
    this.name = 'ApiClientError';
  }
}

async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json' || !response.body) {
    void response.body?.cancel().catch(() => undefined);
    throw new ApiClientError('invalid_response');
  }
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 32768) throw new ApiClientError('invalid_response');
      chunks.push(chunk.value);
    }
    signal.throwIfAborted();
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
    // A malicious/stalled stream's cancellation promise must not extend the deadline.
    try { reader.releaseLock(); } catch { /* Pending read is detached after cancellation. */ }
  }
}

function retryDelay(response: Response, error: SafeError): string | null {
  let delay = error.retry_after_ms === undefined ? null : BigInt(error.retry_after_ms);
  const header = response.headers.get('retry-after');
  // Only bounded integer delta-seconds are used; never a wall-clock HTTP date.
  if (header !== null && /^(0|[1-9][0-9]{0,38})$/.test(header)) {
    const milliseconds = BigInt(header) * 1000n;
    if (delay === null || milliseconds > delay) delay = milliseconds;
  }
  return delay?.toString() ?? null;
}

async function request<T>(path: '/api/v1/dashboard' | '/api/v1/refresh' | '/api/v1/valuation',
  method: 'GET' | 'POST', external: AbortSignal, decode: (input: unknown) => T,
  deadline: number, body?: string): Promise<T> {
  if (external.aborted) throw new ApiClientError('aborted');
  const controller = new AbortController();
  const abort = () => controller.abort();
  external.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, deadline);
  let rejectAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(new ApiClientError(timedOut ? 'timeout' : 'aborted'));
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
  });
  const operation = async () => {
    let response: Response;
    try {
      response = await fetch(path, {
        method,
        headers: method === 'GET'
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(method === 'POST' ? { body: body ?? '{}' } : {}),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
      });
    } catch {
      throw new ApiClientError('disconnected');
    }
    if (controller.signal.aborted) void response.body?.cancel().catch(() => undefined);
    controller.signal.throwIfAborted();
    try {
      const body = await readJson(response, controller.signal);
      controller.signal.throwIfAborted();
      if (response.status === 200) return decode(body);
      if (response.ok) throw new ApiClientError('invalid_response');
      const safeError = decodeErrorEnvelope(body);
      throw new ApiClientError('http_error', response.status, safeError, retryDelay(response, safeError));
    } catch (error) {
      if (error instanceof ApiClientError && error.kind !== 'invalid_response') throw error;
      throw new ApiClientError('invalid_response', response.status);
    }
  };
  try {
    return await Promise.race([operation(), cancelled]);
  } catch (error) {
    if (external.aborted) throw new ApiClientError('aborted');
    if (timedOut) throw new ApiClientError('timeout');
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('disconnected');
  } finally {
    globalThis.clearTimeout(timeout);
    external.removeEventListener('abort', abort);
    if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort);
    controller.abort();
  }
}

export function getDashboard(signal: AbortSignal): Promise<Dashboard> {
  return request('/api/v1/dashboard', 'GET', signal, decodeDashboard, GET_DEADLINE_MS);
}
export function refreshMarkets(signal: AbortSignal): Promise<Dashboard> {
  return request('/api/v1/refresh', 'POST', signal, decodeDashboard, REFRESH_DEADLINE_MS);
}
export function calculatePortfolio(snapshotId: string, quantities: Quantities, signal: AbortSignal): Promise<Valuation> {
  return request('/api/v1/valuation', 'POST', signal, decodeValuation, VALUATION_DEADLINE_MS,
    JSON.stringify({ snapshot_id: snapshotId, quantities }));
}
