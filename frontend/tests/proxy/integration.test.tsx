import { act, render, screen, cleanup } from '@testing-library/react';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { basename, join, resolve } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { expect, it, vi } from 'vitest';
import App from '../../src/App';

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

it('loads a real fixture Rust snapshot through actual Vite and renders its synthetic notice', async () => {
  expect(basename(workspace)).toBe('frontend');
  // No existing process is terminated if either fixed port belongs to someone else.
  await checkPortFree(3000);
  await checkPortFree(5173);
  const nativeFetch = globalThis.fetch;
  let vite: ViteDevServer | undefined;
  let childError: Error | undefined;
  let outputBytes = 0;
  const child = spawn(binary,['--serve','--fixture','success','--dev-ui'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  child.once('error',error => {childError=error;});
  for (const stream of [child.stdout,child.stderr]) stream?.on('data',(chunk:Buffer) => {
    outputBytes += chunk.byteLength;
    if (outputBytes > 8192) {childError=new Error('fixture child exceeded bounded output'); child.kill();}
  });
  try {
    await verifyWindowsListener(child);
    const deadline = performance.now()+10000;
    let ready = false;
    while (performance.now()<deadline) {
      if (childError) throw childError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('fixture child exited before readiness');
      try {
        const response = await nativeFetch('http://127.0.0.1:3000/api/v1/dashboard',{signal:AbortSignal.timeout(300),redirect:'error'});
        if (response.ok) {
          const body = await response.json() as {mode?:unknown;fixture?:{scenario?:unknown}};
          if (body.mode === 'fixture' && body.fixture?.scenario === 'success') {ready=true;break;}
        }
      } catch { /* Readiness polling is local, bounded and never calls a refresh. */ }
      await pause(20);
    }
    expect(ready).toBe(true);
    vite = await createServer({configFile});
    await vite.listen();
    const page = await nativeFetch(origin+'/',{signal:AbortSignal.timeout(3000),redirect:'error'});
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Rust Crypto Monitor');

    const frontendRequests:string[]=[];
    vi.stubGlobal('fetch', async (input:RequestInfo|URL,init?:RequestInit) => {
      expect(input).toBe('/api/v1/dashboard');
      frontendRequests.push(String(input));
      return nativeFetch(origin+String(input),{...init,headers:{...init?.headers,Origin:origin}});
    });
    render(<App />);
    expect(await screen.findByText(/API connected/i)).toBeTruthy();
    expect(screen.getByRole('heading',{name:'Synthetic fixture data'})).toBeTruthy();
    expect(screen.getByText((_,element) => element?.tagName === 'P' && element.textContent === 'Fixture scenario: success')).toBeTruthy();
    expect(screen.getByText(/prices and timestamps are simulated/i)).toBeTruthy();
    expect(screen.getByText(/No provider requests have been made/i)).toBeTruthy();
    expect(frontendRequests).toEqual(['/api/v1/dashboard']);

    for (const badOrigin of ['http://127.0.0.1:3000','null','http://localhost:5173']) {
      const response = await nativeFetch(origin+'/api/v1/dashboard',{headers:{Origin:badOrigin},signal:AbortSignal.timeout(3000),redirect:'error'});
      expect(response.status).toBe(403);
      const body = await response.json() as {error:{code:string}};
      expect(body.error.code).toBe('invalid_origin');
    }
    const noOrigin = await nativeFetch(origin+'/api/v1/dashboard',{signal:AbortSignal.timeout(3000),redirect:'error'});
    expect(noOrigin.status).toBe(200);
    // Native fetch normalizes Host; use a controlled HTTP client for this boundary.
    expect(await wrongHostStatus()).toBe(403);
    const directBad = await nativeFetch('http://127.0.0.1:3000/api/v1/dashboard',{headers:{Origin:'http://127.0.0.1:3000'},signal:AbortSignal.timeout(3000),redirect:'error'});
    expect(directBad.status).toBe(403);
    expect(child.exitCode).toBeNull();
  } finally {
    await act(async () => cleanup());
    vi.unstubAllGlobals();
    if (vite) await vite.close();
    await reap(child);
  }
},30000);
