import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import type { Dashboard, SafeError } from '../../src/api/contracts';
import { decodeDashboard } from '../../src/api/decode';
import { REFRESH_DEADLINE_MS } from '../../src/api/client';
import { dashboard, fixtureNotice, observedDashboard } from '../contracts/fixtures';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const reply=(value:unknown,status=200,headers:Record<string,string>={}) =>
  new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json',...headers}});
function deferred<T>() {
  let resolve!: (value:T)=>void;
  let reject!: (reason:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
const fresh=()=>decodeDashboard(observedDashboard());
const empty=()=>decodeDashboard(dashboard());
function failed(error:SafeError,prior=false):Dashboard {
  const value=prior ? fresh() : empty();
  value.markets=value.markets.map(market=>({...market,state:prior ? 'stale' : 'unavailable',attempt_state:'failed',last_attempt_at_ms:'1',last_error:error}));
  return value;
}
const timeout:SafeError={code:'provider_timeout',message:'Market data request timed out'};
const unavailable:SafeError={code:'provider_unavailable',message:'Market data provider unavailable',status:503};
const refresh=()=>screen.getByRole('button',{name:'Refresh markets'}) as HTMLButtonElement;
const read=()=>screen.getByRole('button',{name:'Read backend state'});
const card=(pair:string)=>screen.getByRole('article',{name:pair});
const methods=(fetchMock:ReturnType<typeof vi.fn>)=>fetchMock.mock.calls.map(call=>(call[1] as RequestInit).method);
async function mount(mock:ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch',mock);
  let result!:ReturnType<typeof render>;
  await act(async()=>{result=render(<App/>);});
  return result;
}
async function clickRefresh() { await act(async()=>{fireEvent.click(refresh());}); }
async function advance(milliseconds:number) { for(let left=milliseconds;left>0;) { const step=Math.min(left,1000); await act(async()=>{await vi.advanceTimersByTimeAsync(step);}); left-=step; } }

describe('manual market dashboard',()=>{
  it('renders exactly one manual refresh action before Market Overview',async()=>{
    const mock=vi.fn().mockResolvedValue(reply(dashboard()));
    await mount(mock);
    const refreshRegions=screen.getAllByRole('region',{name:'Manual refresh'});
    const refreshButtons=screen.getAllByRole('button',{name:'Refresh markets'});
    const market=screen.getByRole('region',{name:'Market Overview'});
    expect(refreshRegions).toHaveLength(1);
    expect(refreshButtons).toHaveLength(1);
    expect(refreshRegions[0]!.compareDocumentPosition(market) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(methods(mock)).toEqual(['GET']);
  });
  it('renders two empty fixture cards without fake prices, charts, automatic refresh or polling',async()=>{
    vi.useFakeTimers();
    const mock=vi.fn().mockResolvedValue(reply(dashboard()));
    await mount(mock);
    expect(screen.getByRole('heading',{name:'Market Overview'})).toBeTruthy();
    expect(screen.getByRole('heading',{name:'Provider Health'})).toBeTruthy();
    expect(screen.getAllByRole('article')).toHaveLength(2);
    for(const pair of ['BTC/USDT','ETH/USDT']) {
      expect(within(card(pair)).getByText('Unavailable',{selector:'.price-value'})).toBeTruthy();
      expect(within(card(pair)).getByText('USDT')).toBeTruthy();
    }
    expect(screen.getByText(fixtureNotice)).toBeTruthy();
    expect(document.querySelector('svg,canvas')).toBeNull();
    expect(document.querySelector('.price-value')?.textContent).not.toBe('0');
    await advance(120000);
    expect(methods(mock)).toEqual(['GET']);
  });
  it('keeps a real mode snapshot distinct from synthetic data',async()=>{
    await mount(vi.fn().mockResolvedValue(reply(dashboard('real'))));
    expect(screen.getByRole('heading',{name:'Real mode'})).toBeTruthy();
    expect(screen.queryByRole('heading',{name:'Synthetic fixture data'})).toBeNull();
    expect(document.body.textContent).not.toContain('Binance online');
  });
  it('one explicit action posts once and synchronously blocks duplicate clicks',async()=>{
    const pending=deferred<Response>();
    const mock=vi.fn().mockResolvedValueOnce(reply(dashboard())).mockReturnValueOnce(pending.promise);
    await mount(mock);
    await act(async()=>{fireEvent.click(refresh());fireEvent.click(refresh());});
    expect(methods(mock)).toEqual(['GET','POST']);
    expect(refresh().disabled).toBe(true);
    expect((mock.mock.calls[1]![1] as RequestInit).body).toBe('{}');
    expect(screen.getByRole('region',{name:'Market Overview'}).getAttribute('aria-busy')).toBe('true');
    await act(async()=>{pending.resolve(reply(fresh()));});
    expect(within(card('BTC/USDT')).getByText('65000.1200000000000000000001')).toBeTruthy();
    expect(within(card('ETH/USDT')).getByText('2500.00000001')).toBeTruthy();
    expect(within(card('BTC/USDT')).getByText('Fresh')).toBeTruthy();
    expect(screen.getByText(fixtureNotice)).toBeTruthy();
    expect(document.body.textContent).not.toContain('Binance online');
  });
  it('refresh is keyboard accessible and has a real action',async()=>{
    const user=userEvent.setup();
    const mock=vi.fn().mockResolvedValueOnce(reply(dashboard())).mockResolvedValueOnce(reply(fresh()));
    await mount(mock);
    refresh().focus();
    expect(document.activeElement).toBe(refresh());
    await user.keyboard('{Enter}');
    expect(methods(mock)).toEqual(['GET','POST']);
    expect(within(card('ETH/USDT')).getByText('2500.00000001')).toBeTruthy();
  });
  it('HTTP200 partial failure shows independent outcomes instead of claiming both providers succeeded',async()=>{
    const partial=fresh();
    partial.markets=partial.markets.map((market,index)=>index===0 ? market : {...empty().markets[1]!,attempt_state:'failed',last_error:timeout,last_attempt_at_ms:'1'});
    await mount(vi.fn().mockResolvedValueOnce(reply(dashboard())).mockResolvedValueOnce(reply(partial)));
    await clickRefresh();
    expect(within(card('BTC/USDT')).getByText('65000.1200000000000000000001')).toBeTruthy();
    expect(within(card('ETH/USDT')).getByText('Unavailable',{selector:'.price-value'})).toBeTruthy();
    expect(within(card('ETH/USDT')).getByText(/Market data request timed out/)).toBeTruthy();
    expect(screen.getByText(/Refresh completed with provider errors/)).toBeTruthy();
    expect(screen.getByText('API connected')).toBeTruthy();
  });
  it.each([timeout,unavailable])('HTTP200 with both provider errors reports $code safely',async error=>{
    await mount(vi.fn().mockResolvedValueOnce(reply(dashboard())).mockResolvedValueOnce(reply(failed(error))));
    await clickRefresh();
    for(const pair of ['BTC/USDT','ETH/USDT']) {
      expect(within(card(pair)).getByText('Unavailable',{selector:'.price-value'})).toBeTruthy();
      expect(within(card(pair)).getByText(new RegExp(error.message))).toBeTruthy();
    }
    expect(screen.getByText('API connected')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Binance online');
  });
  it('a failed refresh retains the exact earlier quote and explicitly marks it stale',async()=>{
    await mount(vi.fn().mockResolvedValueOnce(reply(fresh())).mockResolvedValueOnce(reply(failed(timeout,true))));
    await clickRefresh();
    const btc=within(card('BTC/USDT'));
    expect(btc.getByText('65000.1200000000000000000001')).toBeTruthy();
    expect(btc.getByText(/Stale/)).toBeTruthy();
    expect(btc.queryByText('Fresh')).toBeNull();
    expect(btc.getByText(/Latest recorded failure: Market data request timed out/)).toBeTruthy();
    expect(btc.getByText('Synthetic fixture price')).toBeTruthy();
  });
  it('provider rate limiting is distinct from HTTP429 and identifies untouched ETH history',async()=>{
    const limited=fresh();
    limited.refresh_allowed_in_ms='120000';
    limited.markets=limited.markets.map((market,index)=>index===0 ? {...market,state:'stale',attempt_state:'failed',last_error:{code:'provider_rate_limited',message:'Market data rate limited',status:429,retry_after_seconds:'120'}} : market);
    const mock=vi.fn().mockResolvedValueOnce(reply(fresh())).mockResolvedValueOnce(reply(limited));
    await mount(mock);await clickRefresh();
    expect(screen.getByText(/Provider rate limited. Review per-market/)).toBeTruthy();
    expect(screen.getByText('Not attempted in the recorded refresh batch')).toBeTruthy();
    expect(screen.getByText(/prior attempt details are retained/)).toBeTruthy();
    expect(within(card('ETH/USDT')).getByText('Successful observation')).toBeTruthy();
    expect(refresh().disabled).toBe(true);
    expect(methods(mock)).toEqual(['GET','POST']);
  });
  it('a quote is fresh at60000ms and becomes stale at60001ms without a request',async()=>{
    vi.useFakeTimers();
    const mock=vi.fn().mockResolvedValue(reply(fresh()));
    await mount(mock);
    await advance(60000);
    expect(within(card('BTC/USDT')).getByText('Fresh')).toBeTruthy();
    await advance(1);
    expect(within(card('BTC/USDT')).getByText(/Stale/)).toBeTruthy();
    expect(methods(mock)).toEqual(['GET']);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('tab resume invalidates retained freshness without requesting any market or dashboard data',async()=>{
    vi.useFakeTimers();
    const mock=vi.fn().mockResolvedValue(reply(fresh()));
    await mount(mock);
    await act(async()=>{vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');document.dispatchEvent(new Event('visibilitychange'));});
    await advance(300000);
    await act(async()=>{vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');document.dispatchEvent(new Event('visibilitychange'));});
    expect(within(card('BTC/USDT')).getByText(/Stale/)).toBeTruthy();
    expect(screen.getByText(/Tab resumed/)).toBeTruthy();
    expect(read()).toBeTruthy();
    expect(methods(mock)).toEqual(['GET']);
  });
  it.each([
    [409,'refresh_in_progress','Refresh is in progress'],
    [503,'worker_unavailable','Market worker is unavailable'],
    [503,'overloaded','Service is busy'],
    [503,'service_stopping','Service is stopping'],
  ] as const)('HTTP%i %s blocks more POSTs and offers a safe explicit read',async(status,code,message)=>{
    const mock=vi.fn().mockResolvedValueOnce(reply(fresh())).mockResolvedValueOnce(reply({error:{code,message}},status)).mockResolvedValueOnce(reply(fresh()));
    await mount(mock);await clickRefresh();
    expect(refresh().disabled).toBe(true);
    expect(read()).toBeTruthy();
    expect(screen.queryByText('Backend ready')).toBeNull();
    expect(screen.getByText('Backend state unconfirmed')).toBeTruthy();
    expect(within(card('BTC/USDT')).getByText(/Stale/)).toBeTruthy();
    expect(methods(mock)).toEqual(['GET','POST']);
    await act(async()=>{fireEvent.click(read());});
    expect(methods(mock)).toEqual(['GET','POST','GET']);
    expect(refresh().disabled).toBe(false);
  });
  it('HTTP429 accepts the greater header cooldown and only enables a later explicit user action',async()=>{
    vi.useFakeTimers();
    const mock=vi.fn().mockResolvedValueOnce(reply(dashboard())).mockResolvedValueOnce(reply({error:{code:'refresh_cooldown',message:'Refresh cooldown applies',retry_after_ms:'1500'}},429,{'Retry-After':'3'}));
    await mount(mock);await clickRefresh();
    expect(screen.getByText(/Estimated cooldown: 3 seconds/)).toBeTruthy();
    expect(refresh().disabled).toBe(true);
    await advance(2999);expect(refresh().disabled).toBe(true);
    await advance(1);expect(refresh().disabled).toBe(false);
    await advance(20000);expect(methods(mock)).toEqual(['GET','POST']);
  });
  it.each([false,true])('HTTP504 (nonJSON=%s) performs one read-only reconciliation with no POST retry',async nonJSON=>{
    const expired=nonJSON ? new Response('private-proxy-error',{status:504}) : reply({error:{code:'refresh_wait_timeout',message:'Refresh waiter timed out; work may continue'}},504);
    const mock=vi.fn().mockResolvedValueOnce(reply(dashboard())).mockResolvedValueOnce(expired).mockResolvedValueOnce(reply(fresh()));
    await mount(mock);await clickRefresh();
    expect(methods(mock)).toEqual(['GET','POST','GET']);
    expect(screen.getByText(/Backend state was read once/)).toBeTruthy();
    expect(within(card('BTC/USDT')).getByText('65000.1200000000000000000001')).toBeTruthy();
    expect(document.body.textContent).not.toContain('private-proxy-error');
  });
  it('client refresh deadline performs only one reconciliation GET even if the transport ignores abort',async()=>{
    vi.useFakeTimers();
    const mock=vi.fn().mockResolvedValueOnce(reply(dashboard())).mockImplementationOnce(()=>new Promise<Response>(()=>{})).mockResolvedValueOnce(reply(fresh()));
    await mount(mock);await clickRefresh();
    await advance(REFRESH_DEADLINE_MS-1);
    expect(methods(mock)).toEqual(['GET','POST']);
    await advance(1);
    expect(methods(mock)).toEqual(['GET','POST','GET']);
    await advance(50000);
    expect(methods(mock)).toEqual(['GET','POST','GET']);
  });
  it('failed reconciliation leaves uncertain disconnected state and preserves previous quote',async()=>{
    const mock=vi.fn().mockResolvedValueOnce(reply(fresh())).mockResolvedValueOnce(reply({error:{code:'refresh_wait_timeout',message:'Refresh waiter timed out; work may continue'}},504)).mockRejectedValueOnce(new Error('private-downstream'));
    await mount(mock);await clickRefresh();
    expect(screen.getByText('API disconnected')).toBeTruthy();
    expect(screen.getByText(/Refresh outcome is uncertain/)).toBeTruthy();
    expect(within(card('BTC/USDT')).getByText('65000.1200000000000000000001')).toBeTruthy();
    expect(within(card('BTC/USDT')).getByText(/Stale/)).toBeTruthy();
    expect(refresh().disabled).toBe(true);
    expect(read()).toBeTruthy();
    expect(methods(mock)).toEqual(['GET','POST','GET']);
    expect(document.body.textContent).not.toContain('private-downstream');
  });
  it('busy reconciliation does not recurse or release the next refresh',async()=>{
    vi.useFakeTimers();
    const busy=empty();busy.refresh_in_progress=true;
    const mock=vi.fn().mockResolvedValueOnce(reply(dashboard())).mockResolvedValueOnce(reply({error:{code:'refresh_wait_timeout',message:'Refresh waiter timed out; work may continue'}},504)).mockResolvedValueOnce(reply(busy));
    await mount(mock);await clickRefresh();await advance(120000);
    expect(refresh().disabled).toBe(true);
    expect(read()).toBeTruthy();
    expect(methods(mock)).toEqual(['GET','POST','GET']);
  });
  it.each(['offline','malformed','unsupported'] as const)('keeps previously observed data stale after %s refresh failure',async kind=>{
    const mock=vi.fn().mockResolvedValueOnce(reply(fresh()));
    if(kind==='offline') mock.mockRejectedValueOnce(new Error('private-stack'));
    else mock.mockResolvedValueOnce(kind==='malformed' ? new Response('private-payload') : reply({...fresh(),schema_version:99}));
    await mount(mock);await clickRefresh();
    expect(screen.getByText('API disconnected')).toBeTruthy();
    expect(within(card('BTC/USDT')).getByText(/Stale/)).toBeTruthy();
    expect(within(card('BTC/USDT')).getByText('65000.1200000000000000000001')).toBeTruthy();
    expect(screen.getByText(fixtureNotice)).toBeTruthy();
    expect(read()).toBeTruthy();
    expect(document.body.textContent).not.toContain('private-');
    expect(methods(mock)).toEqual(['GET','POST']);
  });
  it('supersedes an initial GET and rejects its out-of-order completion after refresh',async()=>{
    const initial=deferred<Response>();
    const updated=fresh();updated.snapshot_id='new-refresh-snapshot';
    const mock=vi.fn().mockReturnValueOnce(initial.promise).mockResolvedValueOnce(reply(updated));
    await mount(mock);
    expect(screen.getByText('Connecting to local API')).toBeTruthy();
    await clickRefresh();
    expect((mock.mock.calls[0]![1] as RequestInit).signal!.aborted).toBe(true);
    await act(async()=>{initial.resolve(reply(dashboard()));await initial.promise;});
    expect(screen.getByText('new-refresh-snapshot')).toBeTruthy();
    expect(screen.queryByText('opaque-token-0')).toBeNull();
    expect(methods(mock)).toEqual(['GET','POST']);
  });
  it('aborts on unmount and ignores obsolete refresh completion',async()=>{
    const pending=deferred<Response>();
    const mock=vi.fn().mockResolvedValueOnce(reply(dashboard())).mockReturnValueOnce(pending.promise);
    const mounted=await mount(mock);await clickRefresh();
    const signal=(mock.mock.calls[1]![1] as RequestInit).signal!;
    mounted.unmount();expect(signal.aborted).toBe(true);
    await act(async()=>{pending.resolve(reply(fresh()));await pending.promise;});
    expect(document.body.textContent).toBe('');
    expect(methods(mock)).toEqual(['GET','POST']);
  });
  it.each(['failed','stopping'] as const)('does not confuse a %s worker with API disconnect or provider health',async service_state=>{
    const value=fresh();value.service_state=service_state;
    value.service_error=service_state==='failed' ? {code:'worker_failed',message:'Market worker failed'} : {code:'service_stopping',message:'Service is stopping'};
    await mount(vi.fn().mockResolvedValue(reply(value)));
    expect(screen.getByText('API connected')).toBeTruthy();
    expect(refresh().disabled).toBe(true);
    expect(within(card('ETH/USDT')).getByText(/Stale/)).toBeTruthy();
    expect(screen.queryByText('Binance online')).toBeNull();
  });
});


it('tab resume during an outstanding read prevents its earlier snapshot becoming current',async()=>{
  const pending=deferred<Response>();
  const mock=vi.fn().mockReturnValueOnce(pending.promise);
  await mount(mock);
  await act(async()=>{vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');document.dispatchEvent(new Event('visibilitychange'));});
  await act(async()=>{vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');document.dispatchEvent(new Event('visibilitychange'));});
  await act(async()=>{pending.resolve(reply(fresh()));});
  expect(within(card('BTC/USDT')).getByText(/Stale/)).toBeTruthy();
  expect(read()).toBeTruthy();
  expect(methods(mock)).toEqual(['GET']);
});

it('a loading snapshot labels previous failure as previous and preserves prior synthetic quotes',async()=>{
  const loading=failed(timeout,true);
  loading.refresh_in_progress=true;
  loading.markets=loading.markets.map(market=>({...market,state:'loading',attempt_state:'loading',last_error_is_previous:true}));
  await mount(vi.fn().mockResolvedValue(reply(loading)));
  const btc=within(card('BTC/USDT'));
  expect(btc.getByText('65000.1200000000000000000001')).toBeTruthy();
  expect(btc.getByText(/Stale.*refresh in progress/)).toBeTruthy();
  expect(btc.getByText(/Previous attempt: Market data request timed out/)).toBeTruthy();
  expect(refresh().disabled).toBe(true);
});


it.each(['offline','malformed','unsupported','http'] as const)('initial %s failure shows safe disconnected snapshot-unavailable state',async kind=>{
  const mock=vi.fn();
  if(kind==='offline') mock.mockRejectedValue(new Error('private-initial-stack'));
  else if(kind==='malformed') mock.mockResolvedValue(new Response('private-initial-payload'));
  else if(kind==='unsupported') mock.mockResolvedValue(reply({...dashboard(),schema_version:99}));
  else mock.mockResolvedValue(reply({error:{code:'invalid_origin',message:'Origin is not allowed'}},403));
  await mount(mock);
  expect(screen.getByText(kind==='http' ? 'API connected' : 'API disconnected')).toBeTruthy();
  if(kind==='http') expect(screen.getByText('Backend state unconfirmed')).toBeTruthy();
  expect(screen.getByRole('heading',{name:'The snapshot is unavailable'})).toBeTruthy();
  expect(screen.queryByText('opaque-token-0')).toBeNull();
  expect(document.body.textContent).not.toContain('private-');
  expect(methods(mock)).toEqual(['GET']);
});

it('initial read cancellation on unmount suppresses obsolete completion after remount',async()=>{
  const old=deferred<Response>();
  const updated=fresh();updated.snapshot_id='remounted-snapshot';
  const mock=vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(reply(updated));
  const first=await mount(mock);
  const signal=(mock.mock.calls[0]![1] as RequestInit).signal!;
  first.unmount();expect(signal.aborted).toBe(true);
  await mount(mock);
  await act(async()=>{old.resolve(reply(dashboard()));await old.promise;});
  expect(screen.getByText('remounted-snapshot')).toBeTruthy();
  expect(screen.queryByText('opaque-token-0')).toBeNull();
  expect(methods(mock)).toEqual(['GET','GET']);
});

it('initial abort rejection after unmount creates no state update or unhandled rejection',async()=>{
  const pending=deferred<Response>();
  const mock=vi.fn().mockReturnValue(pending.promise);
  const mounted=await mount(mock);mounted.unmount();
  await act(async()=>{pending.reject(new DOMException('Aborted','AbortError'));await pending.promise.catch(()=>{});});
  expect(document.body.textContent).toBe('');
  expect(methods(mock)).toEqual(['GET']);
});
