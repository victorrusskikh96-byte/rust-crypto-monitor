import { act, fireEvent, render, screen, cleanup, waitFor, within } from '@testing-library/react';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { basename, join, resolve } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { expect, it, vi } from 'vitest';
import App from '../../src/App';
import type { Dashboard, Valuation } from '../../src/api/contracts';

const origin = 'http://127.0.0.1:5173';
const workspace = process.cwd();
const binary = resolve(workspace,'..','target','debug',process.platform === 'win32' ? 'rust-crypto-monitor.exe' : 'rust-crypto-monitor');
const configFile = join(workspace,'vite.config.ts');

async function checkPortFree(port:number): Promise<void> {
  const reservation = createTcpServer();
  await new Promise<void>((resolve,reject) => {
    reservation.once('error',reject);
    reservation.listen(port,'127.0.0.1',resolve);
  });
  await new Promise<void>((resolve,reject) => reservation.close(error => error ? reject(error) : resolve()));
}
const pause = (milliseconds:number) => new Promise(resolve => setTimeout(resolve,milliseconds));
async function wrongHostStatus(): Promise<number|undefined> {
  return new Promise((resolve,reject) => {
    const request = httpRequest({host:'127.0.0.1',port:5173,path:'/api/v1/dashboard',headers:{Host:'localhost:5173'},timeout:3000},response => {
      let bytes = 0;
      response.on('data',(chunk:Buffer) => {
        bytes += chunk.byteLength;
        if (bytes > 32768) response.destroy(new Error('bounded Host rejection body exceeded'));
      });
      response.on('error',reject);
      response.on('end',() => resolve(response.statusCode));
    });
    request.on('timeout',() => request.destroy(new Error('bounded Host request timed out')));
    request.on('error',reject);
    request.end();
  });
}
async function verifyWindowsListener(child:ChildProcess): Promise<void> {
  if (process.platform !== 'win32') return;
  if (child.pid === undefined || !Number.isSafeInteger(child.pid)) throw new Error('fixture child has no valid process identity');
  // Inspect local ownership before any readiness request. This helper can only
  // read the fixed listener and its own command has a bounded lifetime.
  const command = `$deadline=[DateTime]::UtcNow.AddSeconds(8); while ([DateTime]::UtcNow -lt $deadline) { $listeners=@(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue); if ($listeners.Count -gt 0) { if ($listeners.Count -eq 1 -and $listeners[0].OwningProcess -eq ${child.pid}) { exit 0 }; exit 2 }; Start-Sleep -Milliseconds 20 }; exit 3`;
  await new Promise<void>((resolve,reject) => {
    execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{timeout:10000,maxBuffer:4096,windowsHide:true},error => {
      if (error) reject(new Error('could not verify fixture listener process ownership'));
      else resolve();
    });
  });
}
async function reap(child:ChildProcess): Promise<void> {
  if (child.pid === undefined) return;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise<void>((resolve,reject) => {
    child.once('close',() => resolve());
    child.once('error',reject);
  });
  child.kill();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([closed,new Promise<never>((_,reject) => {timeout=setTimeout(() => reject(new Error('fixture child did not terminate within the bounded wait')),5000);})]);
  } finally { if (timeout) clearTimeout(timeout); }
}

const scenarios=['success','partial','stale','timeout','rate-limit','unavailable'] as const;
// One owned backend and one Vite server per scenario; Vitest fileParallelism=false.
// These are jsdom integration smokes, not browser/visual E2E evidence.
it.each(scenarios)('explicit React -> Vite -> Rust refresh uses only the %s synthetic fixture',async scenario=>{
  expect(basename(workspace)).toBe('frontend');
  await checkPortFree(3000);
  await checkPortFree(5173);
  const nativeFetch=globalThis.fetch;
  let vite:ViteDevServer|undefined;
  let childError:Error|undefined;
  let outputBytes=0;
  const child=spawn(binary,['--serve','--fixture',scenario,'--dev-ui'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  child.once('error',error=>{childError=error;});
  for(const stream of [child.stdout,child.stderr]) stream?.on('data',(chunk:Buffer)=>{
    outputBytes+=chunk.byteLength;
    if(outputBytes>8192) {childError=new Error('fixture child exceeded bounded output');child.kill();}
  });
  try {
    await verifyWindowsListener(child);
    const deadline=performance.now()+10000;
    let ready=false;
    while(performance.now()<deadline) {
      if(childError) throw childError;
      if(child.exitCode!==null || child.signalCode!==null) throw new Error('fixture child exited before readiness');
      try {
        const response=await nativeFetch('http://127.0.0.1:3000/api/v1/dashboard',{signal:AbortSignal.timeout(300),redirect:'error'});
        if(response.ok) {
          const body=await response.json() as {mode?:unknown;fixture?:{scenario?:unknown}};
          if(body.mode==='fixture' && body.fixture?.scenario===scenario) {ready=true;break;}
        }
      } catch { /* Bounded local read-only readiness; no refresh. */ }
      await pause(20);
    }
    expect(ready).toBe(true);
    vite=await createServer({configFile});
    await vite.listen();
    const page=await nativeFetch(origin+'/',{signal:AbortSignal.timeout(3000),redirect:'error'});
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Rust Crypto Monitor');

    const frontendRequests:Array<{path:string;method:string}>=[];
    const snapshots:Dashboard[]=[];
    const valuations:Valuation[]=[];
    vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
      expect(['/api/v1/dashboard','/api/v1/refresh','/api/v1/valuation']).toContain(input);
      const method=init?.method ?? 'GET';
      if(method==='POST') {
        if(input==='/api/v1/valuation') {
          const body=JSON.parse(init?.body as string) as {snapshot_id:string;quantities:unknown};
          expect(body.snapshot_id).toBe(snapshots.at(-1)!.snapshot_id);
          expect(body.quantities).toEqual(valuations.length===0 ? {BTC:'0.1',ETH:'2'} : {BTC:'0',ETH:'0'});
        } else {expect(input).toBe('/api/v1/refresh');expect(init?.body).toBe('{}');}
        expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
      }
      // Node's bridge supplies browser Origin for this smoke. Product JS never does.
      expect(new Headers(init?.headers).has('Origin')).toBe(false);
      frontendRequests.push({path:String(input),method});
      const headers=new Headers(init?.headers);
      headers.set('Origin',origin);
      const response=await nativeFetch(origin+String(input),{...init,headers});
      if(response.status===200) {
        if(input==='/api/v1/valuation') valuations.push(await response.clone().json() as Valuation);
        else snapshots.push(await response.clone().json() as Dashboard);
      }
      return response;
    });
    render(<App/>);
    expect(await screen.findByText('API connected',{}, {timeout:5000})).toBeTruthy();
    expect(screen.getByRole('heading',{name:'Synthetic fixture data'})).toBeTruthy();
    expect(screen.getByText(/prices and timestamps are simulated/i)).toBeTruthy();
    expect(frontendRequests).toEqual([{path:'/api/v1/dashboard',method:'GET'}]);
    for(const market of snapshots[0]!.markets) {
      expect(market.attempt_state).toBe('not_attempted');
      expect(market.observation===null).toBe(scenario!=='stale');
    }
    if(scenario==='stale') expect(within(screen.getByRole('article',{name:'BTC/USDT'})).getByText(/Stale/)).toBeTruthy();
    else expect(document.querySelectorAll('.price-value')).toHaveLength(2);

    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Refresh markets'}));});
    await waitFor(()=>expect(snapshots).toHaveLength(2),{timeout:5000});
    await waitFor(()=>expect(screen.queryByText('Refreshing…')).toBeNull(),{timeout:5000});
    expect(frontendRequests).toEqual([{path:'/api/v1/dashboard',method:'GET'},{path:'/api/v1/refresh',method:'POST'}]);
    const refreshed=snapshots[1]!;
    expect(refreshed.mode).toBe('fixture');
    expect(refreshed.refresh_in_progress).toBe(false);
    expect(BigInt(refreshed.refresh_allowed_in_ms)).toBeGreaterThan(0n);
    expect((screen.getByRole('button',{name:'Refresh markets'}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Estimated cooldown:/)).toBeTruthy();
    const btc=within(screen.getByRole('article',{name:'BTC/USDT'}));
    const eth=within(screen.getByRole('article',{name:'ETH/USDT'}));
    if(scenario==='success' || scenario==='partial' || scenario==='stale') expect(btc.getByText('65000.12')).toBeTruthy();
    if(scenario==='success' || scenario==='stale') expect(eth.getByText('2500.00000001')).toBeTruthy();
    if(scenario==='success') expect(refreshed.markets.map(market=>market.attempt_state)).toEqual(['success','success']);
    else if(scenario==='partial') {
      expect(refreshed.markets.map(market=>market.attempt_state)).toEqual(['success','failed']);
      expect(eth.getByText(/Market data request timed out/)).toBeTruthy();
    } else if(scenario==='stale') {
      expect(refreshed.markets.every(market=>market.state==='stale')).toBe(true);
      expect(btc.getByText(/Stale/)).toBeTruthy();
      expect(btc.getByText(/Market data request timed out/)).toBeTruthy();
    } else if(scenario==='rate-limit') {
      expect(refreshed.markets.map(market=>market.attempt_state)).toEqual(['failed','not_attempted']);
      expect(refreshed.markets[0]!.last_error?.code).toBe('provider_rate_limited');
      expect(screen.getByText(/Remaining ETH refresh was not attempted after BTC rate limiting/)).toBeTruthy();
    } else {
      expect(refreshed.markets.every(market=>market.attempt_state==='failed')).toBe(true);
      expect(btc.getByText(scenario==='timeout' ? /Market data request timed out/ : /Market data provider unavailable.*503/)).toBeTruthy();
    }
    expect(screen.getByText(/health describes simulated local outcomes, not Binance availability/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('Binance online');
    // Settle short local-display intervals; no extra client request or retry is admitted.
    await act(async()=>{await pause(30);});
    expect(frontendRequests).toHaveLength(2);

    // Actual Rust arithmetic through the same React -> Vite path, never a UI mock.
    const portfolio=within(screen.getByRole('region',{name:'Portfolio'}));
    await act(async()=>{
      fireEvent.change(portfolio.getByLabelText('BTC quantity'),{target:{value:'0.1'}});
      fireEvent.change(portfolio.getByLabelText('ETH quantity'),{target:{value:'2'}});
    });
    expect(valuations).toHaveLength(0);
    await act(async()=>{fireEvent.click(portfolio.getByRole('button',{name:'Calculate portfolio'}));});
    await waitFor(()=>expect(valuations).toHaveLength(1),{timeout:5000});
    await waitFor(()=>expect((portfolio.getByRole('button',{name:'Calculate portfolio'}) as HTMLButtonElement).disabled).toBe(false),{timeout:5000});
    const valued=valuations[0]!;
    expect(valued.snapshot_id).toBe(refreshed.snapshot_id);
    expect(valued.mode).toBe('fixture');expect(valued.quote).toBe('USDT');expect(valued.estimate).toBe(true);
    expect(valued.holdings.map(holding=>holding.quantity)).toEqual(['0.1','2']);
    const portfolioText=screen.getByRole('region',{name:'Portfolio'}).textContent!;
    if(scenario==='success') {
      expect(valued.total).toBe('11500.01200002');
      expect(valued.holdings.map(holding=>holding.value)).toEqual(['6500.012','5000.00000002']);
      expect(valued.holdings.map(holding=>holding.allocation_pct)).toEqual(['56.52','43.48']);
      for(const exact of ['65000.12','2500.00000001','6500.012','5000.00000002','11500.01200002','56.52%','43.48%']) expect(portfolioText).toContain(exact);
    } else {
      expect(valued.state).toBe('incomplete');expect(valued.total).toBeNull();
      expect(valued.holdings.every(holding=>holding.allocation_pct===null)).toBe(true);
      expect(portfolioText).toMatch(/incomplete/i);expect(portfolioText).not.toContain('11500.01200002');
      if(scenario==='partial') {
        expect(valued.holdings[0]!.value).toBe('6500.012');expect(valued.holdings[1]!.reason).toBe('quote_missing');
        expect(portfolioText).toContain('6500.012');
      } else expect(valued.holdings.every(holding=>holding.reason===(scenario==='stale'?'quote_stale':'quote_missing'))).toBe(true);
    }
    expect(portfolioText).toMatch(/synthetic/i);

    // Zero quantities remain exactly zero even when every quote is missing/stale.
    await act(async()=>{
      fireEvent.change(portfolio.getByLabelText('BTC quantity'),{target:{value:'0'}});
      fireEvent.change(portfolio.getByLabelText('ETH quantity'),{target:{value:'0'}});
    });
    await act(async()=>{fireEvent.click(portfolio.getByRole('button',{name:'Calculate portfolio'}));});
    await waitFor(()=>expect(valuations).toHaveLength(2),{timeout:5000});
    expect(valuations[1]!.state).toBe('complete');expect(valuations[1]!.total).toBe('0');
    expect(valuations[1]!.holdings.every(holding=>holding.quantity==='0'&&holding.value==='0'&&holding.allocation_pct===null&&holding.reason===null)).toBe(true);
    expect(frontendRequests).toEqual([
      {path:'/api/v1/dashboard',method:'GET'},{path:'/api/v1/refresh',method:'POST'},
      {path:'/api/v1/valuation',method:'POST'},{path:'/api/v1/valuation',method:'POST'},
    ]);

    // Reuse one scenario for unchanged Host/Origin security regression; never POST here.
    if(scenario==='success') {
      for(const badOrigin of ['http://127.0.0.1:3000','null','http://localhost:5173']) {
        const response=await nativeFetch(origin+'/api/v1/dashboard',{headers:{Origin:badOrigin},signal:AbortSignal.timeout(3000),redirect:'error'});
        expect(response.status).toBe(403);
        expect((await response.json() as {error:{code:string}}).error.code).toBe('invalid_origin');
      }
      expect((await nativeFetch(origin+'/api/v1/dashboard',{signal:AbortSignal.timeout(3000),redirect:'error'})).status).toBe(200);
      expect(await wrongHostStatus()).toBe(403);
      expect((await nativeFetch('http://127.0.0.1:3000/api/v1/dashboard',{headers:{Origin:'http://127.0.0.1:3000'},signal:AbortSignal.timeout(3000),redirect:'error'})).status).toBe(403);
    }
    expect(child.exitCode).toBeNull();
  } finally {
    await act(async()=>cleanup());
    vi.unstubAllGlobals();
    if(vite) await vite.close();
    await reap(child);
    await checkPortFree(3000);
    await checkPortFree(5173);
  }
},30000);
