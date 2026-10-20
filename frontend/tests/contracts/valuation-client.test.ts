import { afterEach, expect, it, vi } from 'vitest';
import { calculatePortfolio, VALUATION_DEADLINE_MS } from '../../src/api/client';
import { valuation } from './valuation-fixtures';

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const calculate=(signal=new AbortController().signal)=>calculatePortfolio('opaque-token-0',{BTC:'0.1',ETH:'2'},signal);

it('sends one fixed same-origin POST with exact strings and bounded fetch protections',async()=>{
  const mock=vi.fn().mockResolvedValue(reply(valuation()));vi.stubGlobal('fetch',mock);
  expect(await calculate()).toEqual(valuation());
  expect(mock).toHaveBeenCalledTimes(1);
  const [url,options]=mock.mock.calls[0]! as [string,RequestInit];
  expect(url).toBe('/api/v1/valuation');expect(options.method).toBe('POST');
  expect(JSON.parse(options.body as string)).toEqual({snapshot_id:'opaque-token-0',quantities:{BTC:'0.1',ETH:'2'}});
  expect(options.credentials).toBe('omit');expect(options.redirect).toBe('error');expect(options.cache).toBe('no-store');
  expect(new Headers(options.headers).get('content-type')).toBe('application/json');
  expect(new Headers(options.headers).has('Origin')).toBe(false);
});
it.each([
  [400,{code:'invalid_request',message:'Invalid request'}],
  [400,{code:'invalid_quantity',message:'Enter an unsigned decimal quantity',field:'quantities.BTC'}],
  [409,{code:'refresh_in_progress',message:'Refresh is in progress'}],
  [409,{code:'snapshot_replaced',message:'Reread the dashboard and explicitly recalculate'}],
  [422,{code:'arithmetic_capacity',message:'Portfolio arithmetic capacity exceeded'}],
  [422,{code:'unrepresentable_value',message:'Exact portfolio value is not representable'}],
  [503,{code:'service_stopping',message:'Service is stopping'}],
  [503,{code:'overloaded',message:'Service is busy'}],
  [503,{code:'worker_unavailable',message:'Market worker is unavailable'}],
] as const)('preserves safe valuation HTTP %i errors without retry %#',async(status,error)=>{
  const mock=vi.fn().mockResolvedValue(reply({error},status));vi.stubGlobal('fetch',mock);
  await expect(calculate()).rejects.toMatchObject({kind:'http_error',status,safeError:error});
  expect(mock).toHaveBeenCalledTimes(1);
});
it.each([
  ()=>new Response('{private malformed',{headers:{'content-type':'application/json'}}),
  ()=>new Response(JSON.stringify(valuation()),{headers:{'content-type':'text/html'}}),
  ()=>new Response('x'.repeat(32769),{headers:{'content-type':'application/json'}}),
  ()=>reply({...valuation(),estimate:false}),
  ()=>reply({error:{code:'snapshot_replaced',message:'private upstream text'}},409),
])('rejects malformed, oversized, misleading or unsafe valuation responses %#',async make=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(make()));
  await expect(calculate()).rejects.toMatchObject({kind:'invalid_response'});
});
it('has a separate bounded valuation deadline and cancels stalled transport without retry',async()=>{
  vi.useFakeTimers();const mock=vi.fn(()=>new Promise<Response>(()=>{}));vi.stubGlobal('fetch',mock);
  expect(VALUATION_DEADLINE_MS).toBe(35000);
  const rejection=expect(calculate()).rejects.toMatchObject({kind:'timeout'});
  await vi.advanceTimersByTimeAsync(VALUATION_DEADLINE_MS);await rejection;
  expect((mock.mock.calls[0] as unknown as [string,RequestInit])[1].signal!.aborted).toBe(true);
  expect(mock).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
});
it('sanitizes a disconnected transport and keeps cancellation distinct',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('private-stack')));
  await expect(calculate()).rejects.toMatchObject({kind:'disconnected'});
  const abort=new AbortController();abort.abort();const mock=vi.fn();vi.stubGlobal('fetch',mock);
  await expect(calculate(abort.signal)).rejects.toMatchObject({kind:'aborted'});expect(mock).not.toHaveBeenCalled();
});
