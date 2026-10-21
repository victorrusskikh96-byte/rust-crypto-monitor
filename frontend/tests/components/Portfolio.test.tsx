import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { VALUATION_DEADLINE_MS } from '../../src/api/client';
import { dashboard, observedDashboard } from '../contracts/fixtures';
import { incompleteValuation, valuation, zeroValuation } from '../contracts/valuation-fixtures';

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const calculate=()=>screen.getByRole('button',{name:'Calculate portfolio'}) as HTMLButtonElement;
const portfolio=()=>screen.getByRole('region',{name:'Portfolio'});
const text=()=>portfolio().textContent!;
function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve};}
async function mount(mock:ReturnType<typeof vi.fn>) {vi.stubGlobal('fetch',mock);let mounted!:ReturnType<typeof render>;await act(async()=>{mounted=render(<App/>);});return mounted;}
async function fill(BTC='0.1',ETH='2') {await act(async()=>{fireEvent.change(screen.getByLabelText('BTC quantity'),{target:{value:BTC}});fireEvent.change(screen.getByLabelText('ETH quantity'),{target:{value:ETH}});});}
async function submit() {await act(async()=>{fireEvent.click(calculate());});}
const paths=(mock:ReturnType<typeof vi.fn>)=>mock.mock.calls.map(call=>call[0]);
async function advance(milliseconds:number) {for(let left=milliseconds;left>0;){const step=Math.min(1000,left);await act(async()=>{await vi.advanceTimersByTimeAsync(step);});left-=step;}}

it('focuses BTC for empty quantities while preserving associated errors and sending no valuation POST',async()=>{
  const mock=vi.fn().mockResolvedValue(reply(dashboard()));await mount(mock);await submit();
  expect(document.activeElement).toBe(screen.getByLabelText('BTC quantity'));
  for(const label of ['BTC quantity','ETH quantity']) {
    const input=screen.getByLabelText(label) as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.type).toBe('text');expect(input.inputMode).toBe('decimal');expect(input.getAttribute('aria-invalid')).toBe('true');
    const errorId=input.getAttribute('aria-describedby')!.split(' ').find(id=>document.getElementById(id)?.getAttribute('role')==='alert');
    expect(errorId).toBeTruthy();expect(document.getElementById(errorId!)!.textContent!.length).toBeGreaterThan(0);
  }
  expect(paths(mock)).toEqual(['/api/v1/dashboard']);
});
it.each([
  ['-1','2','BTC quantity'],
  ['0.1','1e2','ETH quantity'],
] as const)('focuses the first invalid field for pointer submission of BTC=%s ETH=%s',async(BTC,ETH,label)=>{
  const mock=vi.fn().mockResolvedValue(reply(dashboard()));await mount(mock);await fill(BTC,ETH);await submit();
  expect(document.activeElement).toBe(screen.getByLabelText(label));
  expect((screen.getByLabelText('BTC quantity') as HTMLInputElement).value).toBe(BTC);
  expect((screen.getByLabelText('ETH quantity') as HTMLInputElement).value).toBe(ETH);
  expect(paths(mock)).toEqual(['/api/v1/dashboard']);
});
it('focuses BTC after an invalid keyboard Enter submission',async()=>{
  const mock=vi.fn().mockResolvedValue(reply(dashboard()));await mount(mock);await fill('-1','1e2');
  calculate().focus();await userEvent.setup().keyboard('{Enter}');
  expect(document.activeElement).toBe(screen.getByLabelText('BTC quantity'));
  expect(paths(mock)).toEqual(['/api/v1/dashboard']);
});
it('does not move focus while correcting an error or during a rerender',async()=>{
  const mock=vi.fn().mockResolvedValue(reply(dashboard()));const mounted=await mount(mock);await fill('0.1','1e2');await submit();
  const ETH=screen.getByLabelText('ETH quantity') as HTMLInputElement;
  expect(document.activeElement).toBe(ETH);
  await act(async()=>{fireEvent.change(ETH,{target:{value:'2'}});});
  expect(document.activeElement).toBe(ETH);expect(ETH.getAttribute('aria-invalid')).toBeNull();
  mounted.rerender(<App/>);expect(document.activeElement).toBe(ETH);
  expect(paths(mock)).toEqual(['/api/v1/dashboard']);
});
it('keeps a disabled unavailable submission inert without moving focus',async()=>{
  const pending=deferred<Response>();const mock=vi.fn().mockReturnValue(pending.promise);await mount(mock);
  const ETH=screen.getByLabelText('ETH quantity') as HTMLInputElement;ETH.focus();
  expect(calculate().disabled).toBe(true);await submit();
  expect(document.activeElement).toBe(ETH);expect(mock).toHaveBeenCalledTimes(1);
});
it('describes currently accepted market data without implying snapshot selection',async()=>{
  const mock=vi.fn().mockResolvedValueOnce(reply(observedDashboard())).mockResolvedValueOnce(reply(valuation()));
  await mount(mock);await fill();await submit();
  expect(text()).toMatch(/(?:latest confirmed|currently accepted) market data/i);
  expect(text()).not.toMatch(/selected market snapshot/i);
  expect(text()).toMatch(/synthetic fixture data/i);
  for(const exact of ['6500.012','5000.00000002','11500.01200002','56.52%','43.48%']) expect(text()).toContain(exact);
});
it('preserves typed text and requires exactly one explicit calculation with accepted snapshot',async()=>{
  const pending=deferred<Response>();const mock=vi.fn().mockResolvedValueOnce(reply(observedDashboard())).mockReturnValueOnce(pending.promise);
  await mount(mock);await fill('000.10000000','2');expect(paths(mock)).toEqual(['/api/v1/dashboard']);
  const BTC=screen.getByLabelText('BTC quantity') as HTMLInputElement;BTC.focus();
  await act(async()=>{fireEvent.click(calculate());fireEvent.click(calculate());});
  expect(paths(mock)).toEqual(['/api/v1/dashboard','/api/v1/valuation']);expect(calculate().disabled).toBe(true);expect(document.activeElement).toBe(BTC);
  expect(JSON.parse((mock.mock.calls[1]![1] as RequestInit).body as string)).toEqual({snapshot_id:'opaque-token-0',quantities:{BTC:'000.10000000',ETH:'2'}});
  await act(async()=>{pending.resolve(reply(valuation()));});
  expect(BTC.value).toBe('000.10000000');expect(document.activeElement).toBe(BTC);
  for(const exact of ['65000.12','6500.012','2500.00000001','5000.00000002','11500.01200002','56.52%','43.48%']) expect(text()).toContain(exact);
  expect(text()).toMatch(/estimate/i);expect(text()).toMatch(/synthetic/i);
});
it('supports keyboard Calculate submission',async()=>{
  const mock=vi.fn().mockResolvedValueOnce(reply(observedDashboard())).mockResolvedValueOnce(reply(valuation()));await mount(mock);await fill();
  calculate().focus();await userEvent.setup().keyboard('{Enter}');
  expect(paths(mock)).toEqual(['/api/v1/dashboard','/api/v1/valuation']);expect(text()).toContain('11500.01200002');
});
it.each([['quote_missing',false],['quote_stale',true],['quote_missing',true]] as const)('displays honest %s incomplete holdings (both=%s)',async(reason,both)=>{
  const mock=vi.fn().mockResolvedValueOnce(reply(dashboard())).mockResolvedValueOnce(reply(incompleteValuation(reason,both)));
  await mount(mock);await fill();await submit();
  expect(text()).toMatch(/incomplete/i);expect(text()).toMatch(reason==='quote_missing' ? /missing|unavailable/i : /stale/i);
  if(!both) expect(text()).toContain('6500.012');
  expect(text()).not.toContain('11500.01200002');expect(text()).not.toContain('56.52%');expect(text()).not.toContain('43.48%');
  expect(screen.getByText('API connected')).toBeTruthy();
});
it('accepts both zero holdings without quotes as exact total zero with unavailable allocations',async()=>{
  const mock=vi.fn().mockResolvedValueOnce(reply(dashboard())).mockResolvedValueOnce(reply(zeroValuation()));
  await mount(mock);await fill('0','0');await submit();
  expect(text()).toMatch(/complete/i);expect(text()).toContain('0');expect(text()).not.toContain('0.00%');
  expect(paths(mock)).toEqual(['/api/v1/dashboard','/api/v1/valuation']);
});
it.each([
  ['snapshot_replaced','Reread the dashboard and explicitly recalculate'],
  ['refresh_in_progress','Refresh is in progress'],
] as const)('409 %s offers explicit reconciliation without retrying POST',async(code,message)=>{
  const mock=vi.fn().mockResolvedValueOnce(reply(observedDashboard())).mockResolvedValueOnce(reply({error:{code,message}},409)).mockResolvedValueOnce(reply(observedDashboard())).mockResolvedValueOnce(reply(valuation()));
  await mount(mock);await fill();await submit();
  expect(text()).toMatch(/market state may have changed/i);expect(calculate().disabled).toBe(true);
  expect(paths(mock)).toEqual(['/api/v1/dashboard','/api/v1/valuation']);
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Read backend state'}));});
  expect(paths(mock)).toEqual(['/api/v1/dashboard','/api/v1/valuation','/api/v1/dashboard']);
  await submit();expect(paths(mock)).toEqual(['/api/v1/dashboard','/api/v1/valuation','/api/v1/dashboard','/api/v1/valuation']);
});
it.each([
  ['arithmetic_capacity','Portfolio arithmetic capacity exceeded'],
  ['unrepresentable_value','Exact portfolio value is not representable'],
] as const)('shows sanitized 422 %s without zero substitution or retry',async(code,message)=>{
  const mock=vi.fn().mockResolvedValueOnce(reply(observedDashboard())).mockResolvedValueOnce(reply({error:{code,message}},422));
  await mount(mock);await fill();await submit();expect(text()).toContain(message);expect(text()).not.toContain('11500.01200002');
  expect(paths(mock)).toEqual(['/api/v1/dashboard','/api/v1/valuation']);
});
it('aborts edited pending work and ignores its completion while accepting a newer calculation',async()=>{
  const pending=deferred<Response>();const newer=valuation();newer.holdings=newer.holdings.map(h=>h.asset==='ETH'?{...h,quantity:'3'}:h);
  const mock=vi.fn().mockResolvedValueOnce(reply(observedDashboard())).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(reply(newer));
  await mount(mock);await fill();await submit();const signal=(mock.mock.calls[1]![1] as RequestInit).signal!;
  await fill('0.1','3');expect(signal.aborted).toBe(true);await submit();
  await act(async()=>{pending.resolve(reply({...valuation(),total:'9'}));});
  expect(text()).toContain('11500.01200002');expect((screen.getByLabelText('ETH quantity') as HTMLInputElement).value).toBe('3');
  expect(text()).not.toMatch(/outdated/i);expect(paths(mock)).toEqual(['/api/v1/dashboard','/api/v1/valuation','/api/v1/valuation']);
});
it.each([false,true])('market refresh invalidates pending valuation even with unchanged snapshot ID=%s',async unchanged=>{
  const pending=deferred<Response>();const next=observedDashboard();next.snapshot_id=unchanged?'opaque-token-0':'replacement';
  const mock=vi.fn().mockResolvedValueOnce(reply(observedDashboard())).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(reply(next));
  await mount(mock);await fill();await submit();
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Refresh markets'}));});
  expect((mock.mock.calls[1]![1] as RequestInit).signal!.aborted).toBe(true);
  await act(async()=>{pending.resolve(reply(valuation()));});
  expect(text()).not.toContain('11500.01200002');expect(paths(mock)).toEqual(['/api/v1/dashboard','/api/v1/valuation','/api/v1/refresh']);
});
it('marks accepted values outdated on edits, quote expiry and tab resume without automatic requests',async()=>{
  vi.useFakeTimers();const mock=vi.fn().mockResolvedValueOnce(reply(observedDashboard())).mockResolvedValueOnce(reply(valuation()));
  await mount(mock);await fill();await submit();await advance(60001);expect(text()).toMatch(/outdated/i);
  await act(async()=>{vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');document.dispatchEvent(new Event('visibilitychange'));});
  await act(async()=>{vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');document.dispatchEvent(new Event('visibilitychange'));});
  expect(text()).toMatch(/outdated/i);await fill('0.2','2');expect(text()).toMatch(/outdated/i);
  expect(paths(mock)).toEqual(['/api/v1/dashboard','/api/v1/valuation']);
});
it('aborts pending valuation on tab resume and on unmount, ignoring transport completion',async()=>{
  const pending=deferred<Response>();const mock=vi.fn().mockResolvedValueOnce(reply(observedDashboard())).mockReturnValueOnce(pending.promise);
  const mounted=await mount(mock);await fill();await submit();
  await act(async()=>{vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');document.dispatchEvent(new Event('visibilitychange'));});
  expect((mock.mock.calls[1]![1] as RequestInit).signal!.aborted).toBe(true);mounted.unmount();
  await act(async()=>{pending.resolve(reply(valuation()));});expect(document.body.textContent).toBe('');
});
it('unmount alone cancels an outstanding valuation and discards its eventual response',async()=>{
  const pending=deferred<Response>();const mock=vi.fn().mockResolvedValueOnce(reply(observedDashboard())).mockReturnValueOnce(pending.promise);
  const mounted=await mount(mock);await fill();await submit();mounted.unmount();
  expect((mock.mock.calls[1]![1] as RequestInit).signal!.aborted).toBe(true);
  await act(async()=>{pending.resolve(reply(valuation()));});expect(document.body.textContent).toBe('');expect(mock).toHaveBeenCalledTimes(2);
});
it('cancels pending work through explicit Cancel without retry',async()=>{
  const pending=deferred<Response>();const mock=vi.fn().mockResolvedValueOnce(reply(observedDashboard())).mockReturnValueOnce(pending.promise);
  await mount(mock);await fill();await submit();await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Cancel calculation'}));});
  expect((mock.mock.calls[1]![1] as RequestInit).signal!.aborted).toBe(true);expect(text()).toMatch(/cancel/i);
  await act(async()=>{pending.resolve(reply(valuation()));});expect(text()).not.toContain('11500.01200002');expect(mock).toHaveBeenCalledTimes(2);
});
it('bounds stalled calculation and does not automatically reconcile or retry',async()=>{
  vi.useFakeTimers();const mock=vi.fn().mockResolvedValueOnce(reply(observedDashboard())).mockImplementationOnce(()=>new Promise<Response>(()=>{}));
  await mount(mock);await fill();await submit();await advance(VALUATION_DEADLINE_MS);
  expect(text()).toMatch(/deadline expired/i);expect(calculate().disabled).toBe(false);expect(mock).toHaveBeenCalledTimes(2);
});
it('an accepted result stays historical after an explicit refresh accepts the same snapshot token',async()=>{
  const refresh=deferred<Response>();const mock=vi.fn().mockResolvedValueOnce(reply(observedDashboard())).mockResolvedValueOnce(reply(valuation())).mockReturnValueOnce(refresh.promise);
  await mount(mock);await fill();await submit();expect(text()).not.toMatch(/outdated/i);
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Refresh markets'}));});
  expect(text()).toMatch(/outdated/i);
  await act(async()=>{refresh.resolve(reply(observedDashboard()));});
  expect(text()).toMatch(/outdated/i);expect(text()).toContain('11500.01200002');
  expect(paths(mock)).toEqual(['/api/v1/dashboard','/api/v1/valuation','/api/v1/refresh']);
});
it('fresh tab resume invalidates accepted values and a read accepting the same ID cannot restore them',async()=>{
  const mock=vi.fn().mockResolvedValueOnce(reply(observedDashboard())).mockResolvedValueOnce(reply(valuation())).mockResolvedValueOnce(reply(observedDashboard()));
  await mount(mock);await fill();await submit();expect(text()).not.toMatch(/outdated/i);
  await act(async()=>{vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');document.dispatchEvent(new Event('visibilitychange'));});
  await act(async()=>{vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');document.dispatchEvent(new Event('visibilitychange'));});
  expect(text()).toMatch(/outdated/i);expect(calculate().disabled).toBe(true);expect(mock).toHaveBeenCalledTimes(2);
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Read backend state'}));});
  expect(text()).toMatch(/outdated/i);expect(calculate().disabled).toBe(false);expect(mock).toHaveBeenCalledTimes(3);
});
it('freshness expiration aborts pending work and ignores a late success without another POST',async()=>{
  vi.useFakeTimers();const pending=deferred<Response>();const mock=vi.fn().mockResolvedValueOnce(reply(observedDashboard())).mockReturnValueOnce(pending.promise);
  await mount(mock);await fill();await advance(59999);await submit();await advance(1);await advance(1);
  expect((mock.mock.calls[1]![1] as RequestInit).signal!.aborted).toBe(true);
  await act(async()=>{pending.resolve(reply(valuation()));});expect(text()).not.toContain('11500.01200002');expect(mock).toHaveBeenCalledTimes(2);
});
it('an immediate user edit invalidates a reply resolving in the same interaction',async()=>{
  const pending=deferred<Response>();const mock=vi.fn().mockResolvedValueOnce(reply(observedDashboard())).mockReturnValueOnce(pending.promise);
  await mount(mock);await fill();await submit();
  await act(async()=>{fireEvent.change(screen.getByLabelText('BTC quantity'),{target:{value:'0.2'}});pending.resolve(reply(valuation()));});
  expect(text()).not.toContain('11500.01200002');expect((screen.getByLabelText('BTC quantity') as HTMLInputElement).value).toBe('0.2');
});
it.each([
  ['service_stopping','Service is stopping'],['overloaded','Service is busy'],['worker_unavailable','Market worker is unavailable'],
] as const)('503 %s retains safe feedback and requires explicit backend read',async(code,message)=>{
  const mock=vi.fn().mockResolvedValueOnce(reply(observedDashboard())).mockResolvedValueOnce(reply({error:{code,message}},503));
  await mount(mock);await fill();await submit();expect(text()).toContain(message);expect(text()).toMatch(/backend unavailable/i);
  expect(calculate().disabled).toBe(true);expect(screen.getByRole('button',{name:'Read backend state'})).toBeTruthy();expect(mock).toHaveBeenCalledTimes(2);
});
it.each(['scenario','mode'] as const)('rejects a valuation whose fixture %s does not match the accepted dashboard',async kind=>{
  const result:Record<string,unknown>={...valuation()};
  if(kind==='scenario') result.fixture={scenario:'partial',notice:(valuation() as {fixture:{notice:string}}).fixture.notice};
  else {delete result.mode;delete result.fixture;delete result.provenance;}
  const mock=vi.fn().mockResolvedValueOnce(reply(observedDashboard())).mockResolvedValueOnce(reply(result));
  await mount(mock);await fill();await submit();expect(text()).toMatch(/invalid or unsupported/i);expect(text()).not.toContain('11500.01200002');
});
it.each(['disconnect','malformed','schema','mismatched-snapshot','mismatched-quantity'] as const)('rejects %s calculation safely',async kind=>{
  const mock=vi.fn().mockResolvedValueOnce(reply(observedDashboard()));
  if(kind==='disconnect') mock.mockRejectedValueOnce(new Error('private-stack'));
  else if(kind==='malformed') mock.mockResolvedValueOnce(new Response('private-payload',{headers:{'content-type':'application/json'}}));
  else if(kind==='schema') mock.mockResolvedValueOnce(reply({...valuation(),estimate:false}));
  else if(kind==='mismatched-snapshot') mock.mockResolvedValueOnce(reply({...valuation(),snapshot_id:'old'}));
  else {const result=valuation();result.holdings=result.holdings.map(h=>h.asset==='BTC'?{...h,quantity:'1'}:h);mock.mockResolvedValueOnce(reply(result));}
  await mount(mock);await fill();await submit();
  expect(text()).toMatch(kind==='disconnect'?/API disconnected/:/invalid or unsupported/);expect(text()).not.toContain('11500.01200002');
  expect(document.body.textContent).not.toContain('private-');expect(mock).toHaveBeenCalledTimes(2);
});
