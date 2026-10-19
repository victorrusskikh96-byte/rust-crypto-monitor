// @vitest-environment node
import { createServer as createHttpServer, type Server } from 'node:http';
import { connect } from 'node:net';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../',import.meta.url));
const configFile = fileURLToPath(new URL('../../vite.config.ts',import.meta.url));
const seen: Array<{url:string|undefined;host:string|undefined;origin:string|undefined;forwarded:string|undefined}> = [];
let backend: Server | undefined;
let vite: ViteDevServer | undefined;
const secretName = `.env.m31-security-${process.pid}`;
const secretPath = fileURLToPath(new URL(`../../${secretName}`,import.meta.url));
let syntheticFileCreated = false;
const marker = 'SYNTHETIC_M31_DENIAL_MARKER';

function exchange(target = '/', headers = 'Host: 127.0.0.1:5173\r\n'): Promise<string> {
  return new Promise((resolve,reject) => {
    const socket = connect({host:'127.0.0.1',port:5173});
    let response = '';
    const timeout = setTimeout(() => socket.destroy(new Error('bounded local request timeout')),5000);
    socket.on('connect',() => socket.write(`GET ${target} HTTP/1.1\r\n${headers}Connection: close\r\n\r\n`));
    socket.on('data',chunk => { response += chunk.toString(); if (response.length > 262144) socket.destroy(new Error('bounded response exceeded')); });
    socket.on('error',reject);
    socket.on('close',() => { clearTimeout(timeout); resolve(response); });
  });
}
function status(response:string) { return response.split('\r\n')[0]; }
function closeServer(server:Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve,reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
}

beforeAll(async () => {
  backend = createHttpServer((request,response) => {
    seen.push({url:request.url,host:request.headers.host,origin:request.headers.origin,forwarded:request.headers['x-forwarded-host'] as string|undefined});
    response.setHeader('content-type','application/json');
    response.end('{"mock":"fixed-local-backend"}');
  });
  await new Promise<void>((resolve,reject) => {
    backend!.once('error',reject);
    backend!.listen(3000,'127.0.0.1',resolve);
  });
  try {
    await writeFile(secretPath,marker,{flag:'wx'});
    syntheticFileCreated = true;
    vite = await createServer({configFile});
    await vite.listen();
  } catch (error) {
    if (vite) await vite.close();
    await closeServer(backend);
    backend = undefined;
    throw error;
  }
});
afterAll(async () => {
  if (vite) await vite.close();
  if (backend) await closeServer(backend);
  if (syntheticFileCreated) await unlink(secretPath);
});

describe('actual Vite development boundary', () => {
  it('accepts the exact authority and serves the real application entry', async () => {
    const result = await exchange();
    expect(status(result)).toContain('200');
    expect(result).toContain('Rust Crypto Monitor');
    expect(result.toLowerCase()).not.toContain('access-control-allow-origin');
    expect(vite!.httpServer!.address()).toMatchObject({address:'127.0.0.1',port:5173});
  });
  it.each([
    'Host: localhost:5173\r\n', 'Host: evil.invalid\r\n', 'Host: 127.0.0.1:3000\r\n',
    'Host: 127.0.0.1:5173.evil.invalid\r\n', 'Host: 127.0.0.1:5173\r\nHost: 127.0.0.1:5173\r\n',
    'Host: 127.0.0.1:5173\r\nX-Forwarded-Host: evil.invalid\r\n',
    'Host: 127.0.0.1:5173\r\nForwarded: host=evil.invalid\r\n',
    'Host: evil.invalid\r\nX-Forwarded-Host: 127.0.0.1:5173\r\n',
  ])('rejects a disallowed/forwarded authority before proxy or file serving (%s)', async headers => {
    const count = seen.length;
    const result = await exchange('/api/v1/dashboard',headers);
    expect(status(result)).toContain('403');
    expect(seen).toHaveLength(count);
    const file = await exchange('/src/main.tsx',headers);
    expect(status(file)).toContain('403');
    expect(file).not.toContain('createRoot');
  });
  it('rejects missing authority and absolute-form URLs', async () => {
    // Node's HTTP parser rejects a missing mandatory Host before middleware.
    expect(status(await exchange('/',''))).toContain('400');
    for (const url of ['http://127.0.0.1:5173/','//evil.invalid/']) expect(status(await exchange(url))).toContain('403');
  });
  it('proxies only the fixed API prefix and rewrites Host while preserving Origin including absence', async () => {
    for (const origin of [undefined,'http://127.0.0.1:5173','null','http://evil.invalid']) {
      const headers = `Host: 127.0.0.1:5173\r\n${origin === undefined ? '' : `Origin: ${origin}\r\n`}`;
      const result = await exchange('/api/v1/dashboard',headers);
      expect(status(result)).toContain('200');
      expect(seen.at(-1)).toEqual({url:'/api/v1/dashboard',host:'127.0.0.1:3000',origin,forwarded:undefined});
    }
    const count = seen.length;
    for (const target of ['/api/v1','/api/v10/dashboard','/api/v1evil/dashboard','/api/v2/dashboard','/api/http://evil.invalid']) await exchange(target);
    expect(seen).toHaveLength(count);
  });
  it('denies repository files outside the frontend and sensitive files inside it', async () => {
    const rust = fileURLToPath(new URL('../../../src/http/mod.rs',import.meta.url)).replaceAll('\\','/');
    for (const target of [`/@fs/${rust}`, '/@fs/C:/Windows/win.ini', '/@fs/C:/projects/rust-crypto-monitor/Cargo.toml', `/${secretName}`, `/@fs/${secretPath.replaceAll('\\','/')}`, '/.git/config']) {
      const result = await exchange(target);
      expect(status(result)).not.toContain('200');
      expect(result).not.toContain(marker);
      expect(result).not.toContain('pub fn run_mode');
      expect(result).not.toContain('[package]');
    }
    expect(vite!.config.server.fs.allow.map(path => path.replaceAll('\\','/').replace(/\/$/,''))).toEqual([root.replaceAll('\\','/').replace(/\/$/,'')]);
  });
  it('denies case and encoding variants before Windows filesystem resolution', async () => {
    for (const target of [
      `/${secretName.toUpperCase()}`,
      `/%2eENV${secretName.slice(4)}`,
      `/${secretName}%20`, `/${secretName}.`, `/${secretName}::$DATA`,
      `/@fs/${secretPath.replaceAll('\\','/').replace(secretName,secretName.toUpperCase())}`,
      '/.GIT/config','/%2eGIT/config','/.NPMRC','/%2eNPMRC',
      '/.GIT./config','/.NPMRC%20',
      '/%5c.env','/safe%5c.env','/%00.env',
    ]) {
      const result = await exchange(target);
      expect(status(result)).toContain('403');
      expect(result).not.toContain(marker);
    }
  });
  it('emits no permissive CORS headers for foreign Origins', async () => {
    const result = await exchange('/','Host: 127.0.0.1:5173\r\nOrigin: http://evil.invalid\r\n');
    expect(result.toLowerCase()).not.toContain('access-control-allow-origin');
    expect(result.toLowerCase()).not.toContain('access-control-allow-credentials');
  });
  it('rejects actual WebSocket upgrade attempts before they reach the proxy', async () => {
    const count = seen.length;
    const result = await exchange('/api/v1/dashboard','Host: 127.0.0.1:5173\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n');
    expect(status(result)).toContain('403');
    expect(result).not.toContain('101');
    expect(seen).toHaveLength(count);
    expect(vite!.config.server.hmr).toBe(false);
    expect(vite!.config.server.ws).toBe(false);
  });
});
