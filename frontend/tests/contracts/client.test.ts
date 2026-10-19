import { afterEach, expect, it, vi } from 'vitest';
import { getDashboard } from '../../src/api/client';
import { dashboard } from './fixtures';

afterEach(() => vi.unstubAllGlobals());

it('uses a fixed relative GET, never contacts a provider, and preserves the abort signal', async () => {
  const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(dashboard()),{headers:{'content-type':'application/json'}}));
  vi.stubGlobal('fetch',mock);
  const abort = new AbortController();
  expect(await getDashboard(abort.signal)).toEqual(dashboard());
  expect(mock).toHaveBeenCalledTimes(1);
  const [url, options] = mock.mock.calls[0]! as [string,RequestInit];
  expect(url).toBe('/api/v1/dashboard');
  expect(options.method ?? 'GET').toBe('GET');
  expect(options.signal).toBe(abort.signal);
  expect(options.credentials).toBe('omit');
  expect(options.cache).toBe('no-store');
});

it.each([400,403,404,429,500,503])('rejects HTTP %i without exposing body details', async status => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('private-upstream-detail',{status})));
  await expect(getDashboard(new AbortController().signal)).rejects.toThrow();
  try { await getDashboard(new AbortController().signal); } catch (error) {
    expect(String(error)).not.toContain('private-upstream-detail');
  }
});

it('preserves abort identity for callers and does not retry', async () => {
  const error = new DOMException('Aborted','AbortError');
  const mock = vi.fn().mockRejectedValue(error);
  vi.stubGlobal('fetch',mock);
  await expect(getDashboard(new AbortController().signal)).rejects.toThrow();
  expect(mock).toHaveBeenCalledTimes(1);
});

it('rejects an oversized streamed response without exposing its contents', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('x'.repeat(32769),{headers:{'content-type':'application/json'}})));
  await expect(getDashboard(new AbortController().signal)).rejects.toThrow();
});

it('rejects malformed JSON with a valid JSON content type', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{broken',{headers:{'content-type':'application/json'}})));
  await expect(getDashboard(new AbortController().signal)).rejects.toThrow();
});

it('rejects a misleading JSON media-type prefix', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(dashboard()),{headers:{'content-type':'application/json-evil'}})));
  await expect(getDashboard(new AbortController().signal)).rejects.toThrow();
});
