import type { Dashboard } from './contracts';
import { decodeDashboard, decodeErrorEnvelope } from './decode';

export class ApiClientError extends Error {
  constructor(public readonly kind: 'disconnected' | 'invalid_response' | 'http_error' | 'aborted') {
    super('The local API snapshot is unavailable');
    this.name = 'ApiClientError';
  }
}

async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new ApiClientError('invalid_response');
  }
  if (!response.body) throw new ApiClientError('invalid_response');
  const reader = response.body.getReader();
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
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  signal.throwIfAborted();
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}

export async function getDashboard(signal: AbortSignal): Promise<Dashboard> {
  try {
    signal.throwIfAborted();
    const response = await fetch('/api/v1/dashboard', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal,
    });
    let body: unknown;
    try {
      body = await readJson(response, signal);
      if (response.ok) return decodeDashboard(body);
      decodeErrorEnvelope(body);
    } catch (error) {
      if (signal.aborted) throw new ApiClientError('aborted');
      if (error instanceof ApiClientError) throw error;
      throw new ApiClientError('invalid_response');
    }
    throw new ApiClientError('http_error');
  } catch (error) {
    if (signal.aborted) throw new ApiClientError('aborted');
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('disconnected');
  }
}
