import { afterEach, expect, it, vi } from 'vitest';
import { getDashboard, refreshMarkets, GET_DEADLINE_MS, REFRESH_DEADLINE_MS } from '../../src/api/client';
import { dashboard } from './fixtures';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const reply = (value: unknown, status=200, headers: Record<string,string>={}) =>
  new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json',...headers}});

it.each(['GET','POST'] as const)('uses a fixed relative %s with credentials omitted and a cancellable composed signal', async method => {
  const mock = vi.fn().mockResolvedValue(reply(dashboard()));
  vi.stubGlobal('fetch',mock);
  const abort = new AbortController();
  expect(await (method === 'GET' ? getDashboard : refreshMarkets)(abort.signal)).toEqual(dashboard());
  expect(mock).toHaveBeenCalledTimes(1);
  const [url,options] = mock.mock.calls[0]! as [string,RequestInit];
  expect(url).toBe(method === 'GET' ? '/api/v1/dashboard' : '/api/v1/refresh');
  expect(options.method).toBe(method);
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(options.credentials).toBe('omit');
  expect(options.cache).toBe('no-store');
  expect(options.redirect).toBe('error');
  expect(new Headers(options.headers).has('Origin')).toBe(false);
  if (method === 'POST') {
    expect(options.body).toBe('{}');
    expect(new Headers(options.headers).get('Content-Type')).toBe('application/json');
  } else expect(options.body).toBeUndefined();
});

it.each([400,403,404,429,500,503])('rejects HTTP %i without exposing raw body details', async status => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('private-upstream-detail',{status})));
  await expect(getDashboard(new AbortController().signal)).rejects.toMatchObject({kind:'invalid_response'});
  try { await getDashboard(new AbortController().signal); } catch (error) { expect(String(error)).not.toContain('private-upstream-detail'); }
});

it.each([409,429,503,504])('preserves safe HTTP %i metadata without a retry', async status => {
  const error = status === 409 ? {code:'refresh_in_progress',message:'Refresh is in progress'}
    : status === 429 ? {code:'refresh_cooldown',message:'Refresh cooldown applies',retry_after_ms:'1500'}
    : status === 504 ? {code:'refresh_wait_timeout',message:'Refresh waiter timed out; work may continue'}
    : {code:'worker_unavailable',message:'Market worker is unavailable'};
  const mock = vi.fn().mockResolvedValue(reply({error},status,{'Retry-After':'3'}));
  vi.stubGlobal('fetch',mock);
  await expect(refreshMarkets(new AbortController().signal)).rejects.toMatchObject({kind:'http_error',status,safeError:error,...(status===429 ? {retryAfterMs:'3000'} : {})});
  expect(mock).toHaveBeenCalledTimes(1);
});

it.each(['Wed, 21 Oct 2030 07:28:00 GMT','-1','1.5','9'.repeat(40)])('ignores untrusted Retry-After header %s', async header => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(reply({error:{code:'refresh_cooldown',message:'Refresh cooldown applies',retry_after_ms:'1500'}},429,{'Retry-After':header})));
  await expect(refreshMarkets(new AbortController().signal)).rejects.toMatchObject({retryAfterMs:'1500'});
});

it('keeps the larger body cooldown when Retry-After is shorter', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(reply({error:{code:'refresh_cooldown',message:'Refresh cooldown applies',retry_after_ms:'4500'}},429,{'Retry-After':'1'})));
  await expect(refreshMarkets(new AbortController().signal)).rejects.toMatchObject({retryAfterMs:'4500'});
});

it.each(['GET','POST'] as const)('bounds a stalled %s fetch without retrying', async method => {
  vi.useFakeTimers();
  const mock=vi.fn(() => new Promise<Response>(()=>{}));
  vi.stubGlobal('fetch',mock);
  const result=(method==='GET' ? getDashboard : refreshMarkets)(new AbortController().signal);
  const rejection=expect(result).rejects.toMatchObject({kind:'timeout'});
  await vi.advanceTimersByTimeAsync(method==='GET' ? GET_DEADLINE_MS : REFRESH_DEADLINE_MS);
  await rejection;
  expect((mock.mock.calls[0] as unknown as [string,RequestInit])[1].signal!.aborted).toBe(true);
  expect(mock).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('includes a stalled response body in the client deadline', async () => {
  vi.useFakeTimers();
  const cancel=vi.fn();
  const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('{'));},cancel});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(stream,{headers:{'content-type':'application/json'}})));
  const result=getDashboard(new AbortController().signal);
  const rejection=expect(result).rejects.toMatchObject({kind:'timeout'});
  await vi.advanceTimersByTimeAsync(GET_DEADLINE_MS);
  await rejection;
  expect(cancel).toHaveBeenCalledTimes(1);
});

it('ordinary external abort forwards cancellation and keeps abort distinct from timeout', async () => {
  const mock=vi.fn(() => new Promise<Response>(()=>{}));
  vi.stubGlobal('fetch',mock);
  const abort=new AbortController();
  const result=getDashboard(abort.signal);
  const rejection=expect(result).rejects.toMatchObject({kind:'aborted'});
  abort.abort();
  await rejection;
  expect((mock.mock.calls[0] as unknown as [string,RequestInit])[1].signal!.aborted).toBe(true);
  expect(mock).toHaveBeenCalledTimes(1);
});

it('does not fetch when already aborted', async () => {
  const mock=vi.fn();vi.stubGlobal('fetch',mock);
  const abort=new AbortController();abort.abort();
  await expect(refreshMarkets(abort.signal)).rejects.toMatchObject({kind:'aborted'});
  expect(mock).not.toHaveBeenCalled();
});

it.each([
  () => new Response('x'.repeat(32769),{headers:{'content-type':'application/json'}}),
  () => new Response('{broken',{headers:{'content-type':'application/json'}}),
  () => new Response(JSON.stringify(dashboard()),{headers:{'content-type':'application/json-evil'}}),
  () => new Response(JSON.stringify({...dashboard(),schema_version:99}),{headers:{'content-type':'application/json'}}),
  () => new Response(new Uint8Array([255]),{headers:{'content-type':'application/json'}}),
  () => reply(dashboard(),201),
])('fails closed for oversized, malformed, unsupported or misleading responses %#', async make => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(make()));
  await expect(getDashboard(new AbortController().signal)).rejects.toMatchObject({kind:'invalid_response'});
});


it('cancels an invalid-media never-ending body without waiting for provider bytes',async()=>{
  const cancel=vi.fn();
  const mock=vi.fn().mockResolvedValue(new Response(new ReadableStream<Uint8Array>({cancel}),{headers:{'content-type':'text/html'}}));
  vi.stubGlobal('fetch',mock);
  await expect(getDashboard(new AbortController().signal)).rejects.toMatchObject({kind:'invalid_response'});
  expect(cancel).toHaveBeenCalledTimes(1);
  expect((mock.mock.calls[0]![1] as RequestInit).signal!.aborted).toBe(true);
});
