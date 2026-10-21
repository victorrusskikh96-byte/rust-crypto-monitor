import { execFile, spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createTcpServer, connect as connectTcp } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const ROOT = resolve(FRONTEND, '..');
const ORIGIN = 'http://127.0.0.1:5173';
const API_ORIGIN = 'http://127.0.0.1:3000';
const VITE_PORT = 5173;
const API_PORT = 3000;
const STARTUP_MS = 12_000;
const POLL_MS = 50;
const COMMAND_MS = 5_000;
const SCENARIO_MS = 25_000;
const OVERALL_MS = 6 * 60_000;
const MAX_OUTPUT_BYTES = 32_768;
const VIEWPORTS = [320, 375, 768, 1024, 1440];
const OTHER_FIXTURES = ['partial', 'stale', 'timeout', 'rate-limit', 'unavailable'];
const INTENTIONAL_FAILURE = process.argv.slice(2).includes('--intentional-failure');
const FOCUSED_TESTS = process.argv.slice(2).includes('--focused-tests');
const COMBINED_FAILURE_CONTROL = process.argv.slice(2).includes('--combined-failure-control');
const API_POLICY = new Map([
  ['/api/v1/dashboard', 'GET'],
  ['/api/v1/refresh', 'POST'],
  ['/api/v1/valuation', 'POST'],
]);
const overallDeadline = Date.now() + OVERALL_MS;
const owned = [];
const cleanupErrors = [];
let interrupted = null;
let cdpPort = null;
let chromeProfile = null;
let artifactDirectory = null;
let viteProcess = null;
let chromeProcess = null;

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { interrupted = signal; });
}

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function ensureActive() {
  if (interrupted) fail(`interrupted by ${interrupted}`);
  if (Date.now() > overallDeadline) fail('overall browser harness deadline exceeded');
}
function delay(milliseconds) { return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds)); }
function safeMessage(error) {
  const text = error instanceof Error ? error.message : String(error);
  return text.replaceAll(ROOT, '<repo>').replaceAll(tmpdir(), '<temp>').slice(0, 1000);
}
function authorizeBrowserRequest(rawUrl, rawMethod) {
  const urlText = String(rawUrl);
  const method = String(rawMethod).toUpperCase();
  const inert = urlText === 'about:blank' || urlText.startsWith('data:') || urlText.startsWith('blob:');
  if (inert) return method === 'GET'
    ? { allowed: true, category: 'inert' }
    : { allowed: false, reason: 'inert_method' };
  let url;
  try { url = new URL(urlText); }
  catch { return { allowed: false, reason: 'invalid_url' }; }
  if (url.origin !== ORIGIN || url.username || url.password) {
    return { allowed: false, reason: url.origin === API_ORIGIN ? 'direct_backend' : 'disallowed_origin' };
  }
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    const approvedMethod = API_POLICY.get(url.pathname);
    return approvedMethod === method && url.search === ''
      ? { allowed: true, category: 'api' }
      : { allowed: false, reason: approvedMethod ? 'api_method_or_query' : 'api_route' };
  }
  return method === 'GET'
    ? { allowed: true, category: 'frontend' }
    : { allowed: false, reason: 'frontend_method' };
}
function failureDiagnostics(primaryFailure, cleanupFailures) {
  const diagnostics = [];
  if (primaryFailure !== null) diagnostics.push(`primary: ${safeMessage(primaryFailure)}`);
  cleanupFailures.forEach((error, index) => diagnostics.push(`cleanup ${index + 1}: ${safeMessage(error)}`));
  return diagnostics;
}
function runFocusedTests() {
  const allowed = [
    ['about:blank', 'GET'],
    ['data:text/plain,fixture', 'GET'],
    ['blob:http://127.0.0.1:5173/fixed-id', 'GET'],
    [`${ORIGIN}/`, 'GET'],
    [`${ORIGIN}/src/main.tsx?t=1`, 'GET'],
    [`${ORIGIN}/api/v1/dashboard`, 'GET'],
    [`${ORIGIN}/api/v1/refresh`, 'POST'],
    [`${ORIGIN}/api/v1/valuation`, 'POST'],
  ];
  const blocked = [
    [`${API_ORIGIN}/api/v1/dashboard`, 'GET', 'direct_backend'],
    ['https://example.invalid/blocked', 'GET', 'disallowed_origin'],
    [`${ORIGIN}/api/v1/dashboard`, 'POST', 'api_method_or_query'],
    [`${ORIGIN}/api/v1/refresh`, 'GET', 'api_method_or_query'],
    [`${ORIGIN}/api/v1/valuation`, 'PUT', 'api_method_or_query'],
    [`${ORIGIN}/api/v1/dashboard?unexpected=1`, 'GET', 'api_method_or_query'],
    [`${ORIGIN}/api/v1/unknown`, 'GET', 'api_route'],
    [`${ORIGIN}/api/v2/dashboard`, 'GET', 'api_route'],
    ['http://localhost:5173/', 'GET', 'disallowed_origin'],
    [`${ORIGIN}/`, 'POST', 'frontend_method'],
  ];
  for (const [url, method] of allowed) assert(authorizeBrowserRequest(url, method).allowed, `focused policy unexpectedly blocked ${method} ${url}`);
  for (const [url, method, reason] of blocked) {
    const decision = authorizeBrowserRequest(url, method);
    assert(!decision.allowed && decision.reason === reason, `focused policy unexpectedly allowed ${method} ${url}`);
  }
  console.log(`PASS focused request policy: ${allowed.length} allowed and ${blocked.length} blocked cases; no request was sent`);

  const diagnostics = failureDiagnostics(
    new Error(`${ROOT} primary-control`),
    [new Error(`${tmpdir()} cleanup-control-one`), new Error('cleanup-control-two')],
  );
  assert(diagnostics.length === 3, 'focused failure reporting lost a primary or cleanup failure');
  assert(diagnostics[0].includes('primary-control') && diagnostics[0].includes('<repo>'), 'focused failure reporting lost or failed to sanitize the primary failure');
  assert(diagnostics[1].includes('cleanup-control-one') && diagnostics[1].includes('<temp>'), 'focused failure reporting lost or failed to sanitize the first cleanup failure');
  assert(diagnostics[2].includes('cleanup-control-two'), 'focused failure reporting lost the second cleanup failure');
  assert(diagnostics.every(message => message.length <= 1011), 'focused failure diagnostic exceeded its bound');
  console.log('PASS focused failure reporting: primary plus every sanitized cleanup failure remain visible');
}
function withTimeout(promise, milliseconds, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds}ms`)), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}
function command(file, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    execFile(file, args, { windowsHide: true, timeout: options.timeout ?? COMMAND_MS, maxBuffer: options.maxBuffer ?? 16_384, cwd: options.cwd },
      (error, stdout, stderr) => error ? reject(new Error(options.error ?? `${basename(file)} command failed`)) : resolvePromise({ stdout, stderr }));
  });
}

async function isPortFree(port) {
  const server = createTcpServer();
  try {
    await new Promise((resolvePromise, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolvePromise);
    });
    return true;
  } catch {
    return false;
  } finally {
    if (server.listening) await new Promise(resolvePromise => server.close(() => resolvePromise()));
  }
}
async function requirePortFree(port) {
  assert(await isPortFree(port), `required loopback port ${port} is already in use`);
}
async function waitPortFree(port, label) {
  const deadline = Date.now() + STARTUP_MS;
  while (Date.now() < deadline) {
    if (await isPortFree(port)) return;
    await delay(POLL_MS);
  }
  fail(`${label} listener on port ${port} survived cleanup`);
}
async function canConnect(port) {
  return new Promise(resolvePromise => {
    const socket = connectTcp({ host: '127.0.0.1', port });
    const timer = setTimeout(() => socket.destroy(), 300);
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolvePromise(true); });
    socket.once('error', () => { clearTimeout(timer); resolvePromise(false); });
  });
}

function capture(stream, record) {
  if (!stream) return;
  stream.on('data', chunk => {
    const text = chunk.toString();
    record.bytes += Buffer.byteLength(text);
    if (record.text.length < MAX_OUTPUT_BYTES) record.text += text.slice(0, MAX_OUTPUT_BYTES - record.text.length);
    if (record.bytes > MAX_OUTPUT_BYTES) record.truncated = true;
  });
}
function startOwned(label, executable, args, cwd) {
  const output = { bytes: 0, text: '', truncated: false };
  const child = spawn(executable, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const item = { label, child, output, spawnError: null, recordedTree: null };
  owned.push(item);
  child.once('error', error => { item.spawnError = error; });
  capture(child.stdout, output);
  capture(child.stderr, output);
  return item;
}
function childClosed(item) {
  return item.child.exitCode !== null || item.child.signalCode !== null;
}
async function awaitChildClose(item, milliseconds) {
  if (childClosed(item)) return true;
  return new Promise(resolvePromise => {
    const done = () => { clearTimeout(timer); resolvePromise(true); };
    const timer = setTimeout(() => { item.child.off('close', done); resolvePromise(false); }, milliseconds);
    item.child.once('close', done);
  });
}
async function stopOwned(item, tree = false) {
  if (!item) return;
  const pid = item.child.pid;
  if (!pid || !Number.isSafeInteger(pid)) fail(`owned ${item.label} process has no valid PID`);
  const initialRoot = item.recordedTree?.find(record => record.pid === pid) ?? null;
  const records = process.platform === 'win32' && tree
    ? (!childClosed(item) ? (await windowsProcessTree(pid, item.label, initialRoot, true) ?? item.recordedTree ?? []) : (item.recordedTree ?? [])) : [];
  if (!childClosed(item)) {
    item.child.kill();
    if (!await awaitChildClose(item, 3_000)) {
      item.child.kill('SIGKILL');
      assert(await awaitChildClose(item, 5_000), `owned ${item.label} process did not terminate`);
    }
  }
  if (records.length) await reapWindowsProcessTree(records, item.label);
}
async function windowsProcessTree(rootPid, label, expectedRoot = null, allowExpectedRootGone = false) {
  if (process.platform !== 'win32') return [];
  const script = `$all=@(Get-CimInstance Win32_Process);$root=$all|Where-Object{$_.ProcessId -eq ${rootPid}}|Select-Object -First 1;if($null -eq $root){exit 0};$ids=New-Object 'System.Collections.Generic.HashSet[uint32]';[void]$ids.Add([uint32]${rootPid});do{$before=$ids.Count;foreach($p in $all){if($ids.Contains([uint32]$p.ParentProcessId)){[void]$ids.Add([uint32]$p.ProcessId)}}}while($ids.Count -gt $before);@($all|Where-Object{$ids.Contains([uint32]$_.ProcessId)}|Select-Object ProcessId,ExecutablePath,@{Name='CreationTicks';Expression={[string]$_.CreationDate.ToUniversalTime().Ticks}})|ConvertTo-Json -Compress`;
  const { stdout } = await command('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 10_000, error: `could not record owned ${label} process tree` });
  if (!stdout.trim()) {
    if (expectedRoot && allowExpectedRootGone) return null;
    fail(`owned ${label} root identity disappeared before tree recording`);
  }
  const parsed = JSON.parse(stdout);
  const records = (Array.isArray(parsed) ? parsed : [parsed]).map(record => ({ pid: Number(record.ProcessId), path: String(record.ExecutablePath ?? ''), creationTicks: String(record.CreationTicks ?? '') }));
  const root = records.find(record => record.pid === rootPid);
  if (!root && expectedRoot && allowExpectedRootGone) return null;
  assert(root?.path && root.creationTicks, `owned ${label} root identity disappeared before tree recording`);
  if (expectedRoot) assert(root.path === expectedRoot.path && root.creationTicks === expectedRoot.creationTicks, `owned ${label} root identity changed before cleanup`);
  return records;
}
async function reapWindowsProcessTree(records, label) {
  for (const record of [...records].reverse()) {
    if (!Number.isSafeInteger(record.pid) || record.pid <= 0 || !record.path || !record.creationTicks) fail(`invalid recorded ${label} process identity`);
    const escaped = record.path.replaceAll("'", "''");
    const script = `$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${record.pid}' -ErrorAction SilentlyContinue;if($null -eq $p){exit 0};if($p.ExecutablePath -ne '${escaped}' -or [string]$p.CreationDate.ToUniversalTime().Ticks -ne '${record.creationTicks}'){exit 4};Stop-Process -Id ${record.pid} -Force -ErrorAction Stop`;
    await command('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 5_000, error: `could not reap recorded owned ${label} process ${record.pid}` });
  }
  const survivors = [];
  for (const record of records) {
    const escaped = record.path.replaceAll("'", "''");
    const script = `$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${record.pid}' -ErrorAction SilentlyContinue;if($null -ne $p -and $p.ExecutablePath -eq '${escaped}' -and [string]$p.CreationDate.ToUniversalTime().Ticks -eq '${record.creationTicks}'){exit 2}`;
    try { await command('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 5_000 }); }
    catch { survivors.push(record.pid); }
  }
  assert(survivors.length === 0, `recorded owned ${label} processes survived cleanup: ${survivors.join(',')}`);
}
async function verifyWindowsListener(port, pid, label) {
  if (process.platform !== 'win32') return;
  const script = `$deadline=[DateTime]::UtcNow.AddSeconds(8); while ([DateTime]::UtcNow -lt $deadline) { $listeners=@(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue); if ($listeners.Count -gt 0) { if ($listeners.Count -eq 1 -and $listeners[0].OwningProcess -eq ${pid}) { exit 0 }; exit 2 }; Start-Sleep -Milliseconds 20 }; exit 3`;
  await command('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 10_000, error: `${label} listener ownership check failed` });
}
async function waitForHttp(url, predicate, label, item) {
  const deadline = Date.now() + STARTUP_MS;
  while (Date.now() < deadline) {
    ensureActive();
    if (item?.spawnError) fail(`${label} failed to start: ${item.spawnError.message}`);
    if (item && childClosed(item)) fail(`${label} exited before readiness`);
    try {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(500) });
      if (await predicate(response)) return;
    } catch { /* A bounded readiness probe may race startup. */ }
    await delay(POLL_MS);
  }
  fail(`${label} readiness deadline exceeded`);
}

async function findChrome() {
  if (process.platform !== 'win32') fail('B4 is verified only on Windows; configure an installed Chrome only after separate review');
  const candidates = [
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch { /* Try the next fixed installation location. */ }
  }
  fail('Google Chrome was not found in a standard Windows installation location; install is not automatic');
}
async function startChrome() {
  const chrome = await findChrome();
  chromeProfile = join(artifactDirectory, 'chrome-profile');
  await mkdir(chromeProfile, { recursive: true });
  chromeProcess = startOwned('Chrome', chrome, [
    '--headless=new', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    `--user-data-dir=${chromeProfile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-default-apps', '--metrics-recording-only', '--disable-features=OptimizationHints,MediaRouter,Translate',
    '--proxy-server=direct://', '--proxy-bypass-list=*', 'about:blank',
  ], ROOT);
  const activePort = join(chromeProfile, 'DevToolsActivePort');
  const deadline = Date.now() + STARTUP_MS;
  let path;
  while (Date.now() < deadline) {
    ensureActive();
    if (childClosed(chromeProcess)) fail('Chrome exited before its CDP endpoint became ready');
    try {
      const lines = (await readFile(activePort, 'utf8')).trim().split(/\r?\n/);
      const port = Number(lines[0]);
      if (Number.isSafeInteger(port) && port > 0 && port < 65536 && lines[1]?.startsWith('/devtools/browser/')) {
        cdpPort = port;
        path = lines[1];
        break;
      }
    } catch { /* Chrome writes the file after binding. */ }
    await delay(POLL_MS);
  }
  assert(cdpPort !== null && path, 'Chrome did not publish a valid ephemeral CDP endpoint');
  assert(await canConnect(cdpPort), 'Chrome CDP listener is not reachable on loopback');
  const version = await fetch(`http://127.0.0.1:${cdpPort}/json/version`, { signal: AbortSignal.timeout(1_000) }).then(response => response.json());
  assert(typeof version.Browser === 'string' && version.Browser.startsWith('Chrome/'), 'unexpected CDP browser identity');
  chromeProcess.recordedTree = await windowsProcessTree(chromeProcess.child.pid, 'Chrome');
  console.log(`PREREQUISITE Chrome ${version.Browser.slice('Chrome/'.length)}; Node ${process.version}; CDP loopback port ${cdpPort}`);
  return { browserWebSocket: `ws://127.0.0.1:${cdpPort}${path}`, version: version.Browser };
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.handlerErrors = [];
  }
  async connect() {
    this.socket = new WebSocket(this.url);
    await withTimeout(new Promise((resolvePromise, reject) => {
      this.socket.addEventListener('open', resolvePromise, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('CDP WebSocket connection failed')), { once: true });
    }), COMMAND_MS, 'CDP connection');
    this.socket.addEventListener('message', event => this.receive(event.data));
    this.socket.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('CDP WebSocket closed'));
      this.pending.clear();
    });
  }
  receive(data) {
    let message;
    try { message = JSON.parse(String(data)); } catch { this.handlerErrors.push(new Error('CDP returned malformed JSON')); return; }
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`CDP ${pending.method} failed: ${message.error.message}`));
      else pending.resolve(message.result ?? {});
      return;
    }
    for (const handler of this.handlers.get(message.method) ?? []) {
      Promise.resolve().then(() => handler(message.params ?? {})).catch(error => this.handlerErrors.push(error));
    }
  }
  on(method, handler) {
    const list = this.handlers.get(method) ?? [];
    list.push(handler);
    this.handlers.set(method, list);
  }
  send(method, params = {}, timeout = COMMAND_MS) {
    assert(this.socket?.readyState === WebSocket.OPEN, `CDP is not open for ${method}`);
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP ${method} deadline exceeded`)); }, timeout);
      this.pending.set(id, { resolve: resolvePromise, reject, timer, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  check() {
    if (this.handlerErrors.length) throw this.handlerErrors.shift();
  }
  close() { if (this.socket?.readyState === WebSocket.OPEN) this.socket.close(); }
}

class BrowserPage {
  constructor(target, width) {
    this.target = target;
    this.width = width;
    this.deadline = Date.now() + SCENARIO_MS;
    this.cdp = new CdpClient(target.webSocketDebuggerUrl);
    this.requests = [];
    this.disallowedAttempts = [];
    this.webSockets = new Map();
    this.runtimeErrors = [];
    this.consoleErrors = [];
    this.loadingFailures = [];
    this.closed = false;
  }
  async initialize() {
    await this.cdp.connect();
    this.cdp.on('Network.requestWillBeSent', event => this.requests.push({ url: event.request.url, method: event.request.method, type: event.type, id: event.requestId }));
    this.cdp.on('Network.webSocketCreated', event => {
      this.webSockets.set(event.requestId, { url: event.url, responseStatus: null, frames: 0, error: null, closed: false });
      if (!event.url.startsWith('ws://127.0.0.1:5173/')) this.disallowedAttempts.push({ url: event.url, method: 'WEBSOCKET', reason: 'websocket_origin' });
    });
    this.cdp.on('Network.webSocketHandshakeResponseReceived', event => {
      const socket = this.webSockets.get(event.requestId);
      if (socket) socket.responseStatus = event.response.status;
    });
    for (const eventName of ['Network.webSocketFrameReceived', 'Network.webSocketFrameSent']) {
      this.cdp.on(eventName, event => { const socket = this.webSockets.get(event.requestId); if (socket) socket.frames += 1; });
    }
    this.cdp.on('Network.webSocketFrameError', event => { const socket = this.webSockets.get(event.requestId); if (socket) socket.error = event.errorMessage; });
    this.cdp.on('Network.webSocketClosed', event => { const socket = this.webSockets.get(event.requestId); if (socket) socket.closed = true; });
    this.cdp.on('Network.loadingFailed', event => this.loadingFailures.push({ id: event.requestId, errorText: event.errorText, canceled: event.canceled }));
    this.cdp.on('Runtime.exceptionThrown', event => this.runtimeErrors.push(event.exceptionDetails?.text ?? 'runtime exception'));
    this.cdp.on('Runtime.consoleAPICalled', event => {
      if (event.type === 'error') this.consoleErrors.push(event.args?.map(argument => argument.value ?? argument.description ?? '').join(' ') ?? 'console error');
    });
    this.cdp.on('Fetch.requestPaused', async event => {
      const decision = authorizeBrowserRequest(event.request.url, event.request.method);
      if (decision.allowed) await this.cdp.send('Fetch.continueRequest', { requestId: event.requestId });
      else {
        this.disallowedAttempts.push({ url: event.request.url, method: event.request.method, reason: decision.reason });
        await this.cdp.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
      }
    });
    for (const domain of ['Page.enable', 'Runtime.enable', 'Network.enable', 'Log.enable']) await this.cdp.send(domain);
    await this.cdp.send('Emulation.setDeviceMetricsOverride', { width: this.width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await this.cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    await this.cdp.send('Page.navigate', { url: `${ORIGIN}/` });
    await this.waitFor('initial dashboard render', `document.body?.innerText.includes('API connected') && document.body.innerText.includes('Synthetic fixture data')`);
    this.assertHealthy('initial navigation');
  }
  async evaluate(expression) {
    ensureActive();
    if (Date.now() > this.deadline) fail(`browser scenario at ${this.width}px exceeded ${SCENARIO_MS}ms`);
    this.cdp.check();
    const result = await this.cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) fail(`browser evaluation failed: ${result.exceptionDetails.text ?? 'exception'}`);
    return result.result?.value;
  }
  async waitFor(label, expression, milliseconds = SCENARIO_MS) {
    const deadline = Math.min(Date.now() + milliseconds, this.deadline, overallDeadline);
    while (Date.now() < deadline) {
      ensureActive();
      if (await this.evaluate(`Boolean(${expression})`)) return;
      await delay(POLL_MS);
    }
    fail(`${label} did not reach the expected state`);
  }
  apiRequests(pathname) {
    return this.requests.filter(request => {
      try { return new URL(request.url).pathname === pathname; } catch { return false; }
    });
  }
  async bodyText() { return this.evaluate('document.body.innerText'); }
  async click(selector) {
    const encoded = JSON.stringify(selector);
    const point = await this.evaluate(`(() => { const element=document.querySelector(${encoded}); if(!element) return null; element.scrollIntoView({block:'center',inline:'center'}); const r=element.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,disabled:Boolean(element.disabled),visible:r.width>0&&r.height>0}; })()`);
    assert(point?.visible && !point.disabled, `cannot click ${selector}`);
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  }
  async selectAll() {
    await this.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 });
    await this.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 });
  }
  async setInput(selector, value) {
    await this.click(selector);
    await this.selectAll();
    if (value.length) await this.cdp.send('Input.insertText', { text: value });
    else {
      await this.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
      await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    }
    await this.waitFor(`input ${selector} value`, `document.querySelector(${JSON.stringify(selector)})?.value===${JSON.stringify(value)}`, 2_000);
  }
  async pressEnter() {
    await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
    await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  }
  assertHealthy(label) {
    this.cdp.check();
    assert(this.disallowedAttempts.length === 0, `${label}: disallowed application request was blocked (${this.disallowedAttempts[0]?.reason ?? 'unknown'})`);
    assert(this.runtimeErrors.length === 0, `${label}: runtime exception: ${this.runtimeErrors[0] ?? ''}`);
    const knownViteDiagnostic = message => /^\[vite\] failed to connect to websocket\.[\s\S]*127\.0\.0\.1:5173/i.test(message);
    const unexpectedConsole = this.consoleErrors.filter(message => !knownViteDiagnostic(message));
    assert(unexpectedConsole.length === 0, `${label}: browser console error: ${unexpectedConsole[0] ?? ''}`);
    for (const socket of this.webSockets.values()) {
      assert(socket.url.startsWith('ws://127.0.0.1:5173/'), `${label}: unexpected WebSocket target`);
      assert(socket.responseStatus !== 101 && socket.frames === 0, `${label}: application WebSocket unexpectedly connected`);
      assert(socket.responseStatus === 403 || socket.error !== null || this.consoleErrors.some(knownViteDiagnostic), `${label}: local Vite WebSocket rejection was not observed`);
    }
    const directBackend = this.requests.some(request => request.url.startsWith(`${API_ORIGIN}/`));
    assert(!directBackend, `${label}: browser bypassed the fixed Vite proxy`);
    for (const request of this.requests) {
      let url;
      try { url = new URL(request.url); } catch { continue; }
      if (!url.pathname.startsWith('/api/')) continue;
      assert(url.origin === ORIGIN && API_POLICY.get(url.pathname) === request.method && url.search === '', `${label}: unexpected API request ${request.method} ${url.pathname}${url.search}`);
    }
    const unexpectedFailures = this.loadingFailures.filter(failure => {
      const request = this.requests.find(candidate => candidate.id === failure.id);
      const socket = this.webSockets.get(failure.id);
      return !(request?.url.startsWith('ws://127.0.0.1:5173/') || socket?.url.startsWith('ws://127.0.0.1:5173/'));
    });
    const firstFailure = unexpectedFailures[0];
    const firstRequest = this.requests.find(candidate => candidate.id === firstFailure?.id);
    assert(unexpectedFailures.length === 0, `${label}: unexpected failed browser request: ${firstFailure?.errorText ?? ''} (${firstRequest?.method ?? 'unknown'} ${firstRequest?.url ?? 'unknown URL'}, type ${firstRequest?.type ?? 'unknown'}, canceled ${String(firstFailure?.canceled ?? false)})`);
  }
  async screenshot(name) {
    const result = await this.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    assert(typeof result.data === 'string' && result.data.length > 0, 'Chrome returned no screenshot data');
    const path = join(artifactDirectory, `${name}.png`);
    await writeFile(path, Buffer.from(result.data, 'base64'));
    return path;
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    try { await this.cdp.send('Page.close', {}, 2_000); } catch { /* Target may already be closed. */ }
    this.cdp.close();
  }
}

async function newPage(width) {
  const response = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT', signal: AbortSignal.timeout(2_000) });
  assert(response.ok, 'Chrome refused a new isolated page target');
  const target = await response.json();
  assert(typeof target.webSocketDebuggerUrl === 'string', 'Chrome target has no CDP WebSocket URL');
  const page = new BrowserPage(target, width);
  try {
    await page.initialize();
    return page;
  } catch (error) {
    await page.close();
    throw error;
  }
}

async function startVite() {
  await requirePortFree(VITE_PORT);
  const viteCli = resolve(FRONTEND, 'node_modules', 'vite', 'bin', 'vite.js');
  await access(viteCli).catch(() => fail('existing frontend dependencies are unavailable; run the documented reviewed npm ci command manually'));
  viteProcess = startOwned('Vite', process.execPath, [viteCli, '--config', resolve(FRONTEND, 'vite.config.ts')], FRONTEND);
  await waitForHttp(`${ORIGIN}/`, async response => response.status === 200 && (await response.text()).includes('Rust Crypto Monitor'), 'Vite', viteProcess);
  await verifyWindowsListener(VITE_PORT, viteProcess.child.pid, 'Vite');
  viteProcess.recordedTree = await windowsProcessTree(viteProcess.child.pid, 'Vite');
}
async function startFixture(scenario) {
  await requirePortFree(API_PORT);
  const binary = resolve(ROOT, 'target', 'debug', process.platform === 'win32' ? 'rust-crypto-monitor.exe' : 'rust-crypto-monitor');
  await access(binary).catch(() => fail('fixture binary is missing; run the required cargo build gate before the browser harness'));
  const fixture = startOwned(`Rust ${scenario} fixture`, binary, ['--serve', '--fixture', scenario, '--dev-ui'], ROOT);
  await waitForHttp(`${API_ORIGIN}/api/v1/dashboard`, async response => {
    if (!response.ok) return false;
    const body = await response.json();
    return body?.mode === 'fixture' && body?.fixture?.scenario === scenario;
  }, `${scenario} fixture`, fixture);
  await verifyWindowsListener(API_PORT, fixture.child.pid, `${scenario} fixture`);
  return fixture;
}

async function withFixture(scenario, action) {
  const fixture = await startFixture(scenario);
  try { return await action(); }
  finally {
    await stopOwned(fixture);
    await waitPortFree(API_PORT, `${scenario} fixture`);
  }
}
async function withPage(width, action) {
  const page = await newPage(width);
  try { return await action(page); }
  finally { await page.close(); }
}

async function assertInitial(page, scenario) {
  const text = await page.bodyText();
  assert(text.includes('Synthetic fixture data'), `${scenario}: synthetic fixture heading missing`);
  assert(text.includes(`Fixture scenario: ${scenario}`), `${scenario}: fixture scenario label missing`);
  assert(/prices and timestamps are simulated/i.test(text), `${scenario}: synthetic warning missing`);
  assert(page.apiRequests('/api/v1/dashboard').length === 1 && page.apiRequests('/api/v1/dashboard')[0].method === 'GET', `${scenario}: initial dashboard GET count/method was not exact`);
  assert(page.apiRequests('/api/v1/refresh').length === 0, `${scenario}: refresh occurred before explicit action`);
  const order = await page.evaluate(`(() => { const refresh=document.querySelector('[aria-label="Refresh markets"]'); const market=document.querySelector('#market-overview-title'); return Boolean(refresh&&market&&(refresh.compareDocumentPosition(market)&Node.DOCUMENT_POSITION_FOLLOWING)); })()`);
  assert(order, `${scenario}: Refresh markets is not discoverable before Market Overview`);
}
async function manualRefresh(page, scenario) {
  await page.click('[aria-label="Refresh markets"]');
  await page.waitFor(`${scenario} refresh completion`, `document.querySelector('[aria-label="Refresh markets"]')?.textContent==='Refresh markets' && document.body.innerText.includes('Estimated cooldown:')`);
  assert(page.apiRequests('/api/v1/refresh').length === 1 && page.apiRequests('/api/v1/refresh')[0].method === 'POST', `${scenario}: manual refresh POST count/method was not exact`);
}
async function calculate(page, btc, eth, expectedCount) {
  await page.setInput('#portfolio-btc', btc);
  await page.setInput('#portfolio-eth', eth);
  await page.click('[aria-label="Calculate portfolio"]');
  await page.waitFor('portfolio calculation completion', `document.querySelector('[aria-label="Calculate portfolio"]')?.textContent==='Calculate portfolio' && document.querySelector('.portfolio-summary')!==null`);
  const valuations = page.apiRequests('/api/v1/valuation');
  assert(valuations.length === expectedCount && valuations.every(request => request.method === 'POST'), `valuation POST count/method was not ${expectedCount}`);
}
async function assertResponsive(page, width) {
  const result = await page.evaluate(`(() => {
    const exact=['65000.12','2500.00000001','6500.012','5000.00000002','11500.01200002','56.52%','43.48%'];
    const leaves=[...document.querySelectorAll('body *')].filter(e=>e.children.length===0);
    const boxes=exact.map(text=>{const e=leaves.find(node=>node.textContent?.trim()===text);if(!e)return {text,missing:true};const r=e.getBoundingClientRect(),s=getComputedStyle(e);let clipped=false;for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const ps=getComputedStyle(p),pr=p.getBoundingClientRect();if(['hidden','clip'].includes(ps.overflowX)&&(r.left<pr.left-.5||r.right>pr.right+.5))clipped=true;}return {text,left:r.left,right:r.right,width:r.width,height:r.height,visibility:s.visibility,display:s.display,clipped};});
    const fields=['btc','eth'].map(asset=>{const e=document.querySelector('#portfolio-'+asset),label=document.querySelector('label[for="portfolio-'+asset+'"]'),r=e?.getBoundingClientRect();return {asset,inputMode:e?.inputMode,label:label?.textContent,name:e?.name,disabled:e?.disabled,width:r?.width,height:r?.height};});
    const buttons=['Refresh markets','Calculate portfolio'].map(name=>{const e=document.querySelector('[aria-label="'+name+'"]'),r=e?.getBoundingClientRect(),s=e?getComputedStyle(e):null;return {name,label:e?.getAttribute('aria-label'),width:r?.width,height:r?.height,display:s?.display,visibility:s?.visibility};});
    const regions=['.portfolio-form','.portfolio-result'].map(selector=>{const e=document.querySelector(selector),r=e?.getBoundingClientRect(),s=e?getComputedStyle(e):null;return {selector,width:r?.width,height:r?.height,display:s?.display,visibility:s?.visibility,fontSize:parseFloat(s?.fontSize??'0')};});
    return {viewport:innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,boxes,
      fields,buttons,regions};
  })()`);
  assert(result.viewport === width, `${width}px: viewport width mismatch`);
  assert(result.scrollWidth <= result.clientWidth, `${width}px: horizontal page overflow detected`);
  for (const field of result.fields) assert(field.inputMode === 'decimal' && field.label === `${field.asset.toUpperCase()} quantity` && field.name === field.asset.toUpperCase() && field.disabled === false && field.width > 0 && field.height > 0, `${width}px: ${field.asset.toUpperCase()} field accessibility/visibility changed`);
  for (const button of result.buttons) assert(button.label === button.name && button.width > 0 && button.height > 0 && button.display !== 'none' && button.visibility !== 'hidden', `${width}px: ${button.name} is not discoverable`);
  for (const region of result.regions) assert(region.width > 0 && region.height > 0 && region.display !== 'none' && region.visibility !== 'hidden' && region.fontSize >= 12, `${width}px: ${region.selector} is not readable`);
  for (const box of result.boxes) {
    assert(!box.missing && box.width > 0 && box.height > 0 && box.display !== 'none' && box.visibility !== 'hidden', `${width}px: financial string ${box.text} is hidden`);
    assert(box.left >= -0.5 && box.right <= width + 0.5 && !box.clipped, `${width}px: financial string ${box.text} is clipped horizontally`);
  }
  await page.click('#portfolio-btc');
  const focus = await page.evaluate(`(() => {const e=document.querySelector('#portfolio-btc'),s=getComputedStyle(e),c=getComputedStyle(e?.closest('.holding-input-control'));return {active:document.activeElement===e,input:{style:s.outlineStyle,width:parseFloat(s.outlineWidth),color:s.outlineColor},control:{style:c.outlineStyle,width:parseFloat(c.outlineWidth),color:c.outlineColor}};})()`);
  const visibleOutline = (focus.input.style !== 'none' && focus.input.width > 0) || (focus.control.style !== 'none' && focus.control.width > 0);
  assert(focus.active && visibleOutline, `${width}px: visible field focus outline missing (${JSON.stringify(focus)})`);
}

async function runSuccess(width) {
  await withFixture('success', () => withPage(width, async page => {
    await assertInitial(page, 'success');
    await manualRefresh(page, 'success');
    await page.waitFor('success exact prices', `document.body.innerText.includes('65000.12') && document.body.innerText.includes('2500.00000001')`);
    await calculate(page, '0.1', '2', 1);
    let text = await page.bodyText();
    for (const exact of ['65000.12', '2500.00000001', '6500.012', '5000.00000002', '11500.01200002', '56.52%', '43.48%']) {
      assert(text.includes(exact), `${width}px success: exact rendered string ${exact} missing`);
    }
    const scoped = await page.evaluate(`(() => {const rows=[...document.querySelectorAll('.asset-valuation-row')].map(row=>({heading:row.querySelector('h4')?.innerText??'',text:row.innerText}));return {btcMarket:document.querySelector('[aria-labelledby="market-BTC"] .price-value')?.textContent?.trim(),ethMarket:document.querySelector('[aria-labelledby="market-ETH"] .price-value')?.textContent?.trim(),btc:rows.find(row=>row.heading.includes('BTC'))?.text??'',eth:rows.find(row=>row.heading.includes('ETH'))?.text??'',total:document.querySelector('.portfolio-total-value')?.textContent?.trim(),unit:document.querySelector('.portfolio-total .valuation-unit')?.textContent?.trim()};})()`);
    assert(scoped.btcMarket === '65000.12' && scoped.ethMarket === '2500.00000001', `${width}px success: market prices are not mapped to the correct assets`);
    for (const exact of ['65000.12', '6500.012', '56.52%']) assert(scoped.btc.includes(exact), `${width}px success: BTC row is missing ${exact}`);
    for (const exact of ['2500.00000001', '5000.00000002', '43.48%']) assert(scoped.eth.includes(exact), `${width}px success: ETH row is missing ${exact}`);
    assert(scoped.total === '11500.01200002' && scoped.unit === 'USDT', `${width}px success: exact total/unit rendering missing`);
    await assertResponsive(page, width);
    await calculate(page, '0', '0', 2);
    text = await page.bodyText();
    const zero = await page.evaluate(`(() => ({total:document.querySelector('.portfolio-total-value')?.textContent?.trim(),allocations:[...document.querySelectorAll('.asset-valuation-details')].map(row=>[...row.querySelectorAll('div')].find(item=>item.querySelector('dt')?.textContent==='Allocation')?.querySelector('dd')?.textContent?.trim())}))()`);
    assert(zero.total === '0', `${width}px success: both-zero total is not exact 0`);
    assert(zero.allocations.length === 2 && zero.allocations.every(value => value === 'Unavailable'), `${width}px success: zero allocations were fabricated`);
    assert(text.includes('Synthetic fixture data') && /prices and timestamps are simulated/i.test(text), `${width}px success: synthetic warning disappeared`);
    assert(page.apiRequests('/api/v1/dashboard').length === 1 && page.apiRequests('/api/v1/refresh').length === 1 && page.apiRequests('/api/v1/valuation').length === 2, `${width}px success: unexpected API request count`);
    page.assertHealthy(`${width}px success`);
    const screenshot = await page.screenshot(`success-${width}x1000`);
    console.log(`PASS success ${width}x1000 (${screenshot})`);
  }));
}

async function assertFieldError(page, selector, expectedError) {
  try {
    await page.waitFor(`${selector} focused validation error`, `(() => {const e=document.querySelector(${JSON.stringify(selector)});const ids=(e?.getAttribute('aria-describedby')??'').split(/\\s+/);return document.activeElement===e&&e?.getAttribute('aria-invalid')==='true'&&ids.some(id=>document.getElementById(id)?.getAttribute('role')==='alert');})()`, 2_000);
  } catch (error) {
    const diagnostic = await page.evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});return {active:document.activeElement?.id,invalid:e?.getAttribute('aria-invalid'),describedby:e?.getAttribute('aria-describedby'),value:e?.value,buttonDisabled:document.querySelector('[aria-label="Calculate portfolio"]')?.disabled};})()`);
    fail(`${safeMessage(error)} (${JSON.stringify(diagnostic)})`);
  }
  const result = await page.evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});const ids=(e?.getAttribute('aria-describedby')??'').split(/\\s+/);const ownError=${JSON.stringify(selector.slice(1))}+'-error';return {active:document.activeElement===e,invalid:e?.getAttribute('aria-invalid'),value:e?.value,errorId:ids.find(id=>document.getElementById(id)?.getAttribute('role')==='alert'),errorText:document.getElementById(ownError)?.textContent?.trim()};})()`);
  assert(result.active && result.invalid === 'true' && result.errorId === `${selector.slice(1)}-error` && result.errorText === expectedError, `${selector}: focused field-specific validation error missing`);
  return result;
}
async function runInvalidForm() {
  await withFixture('success', () => withPage(375, async page => {
    await assertInitial(page, 'success');
    const baseline = page.apiRequests('/api/v1/valuation').length;

    await page.click('[aria-label="Calculate portfolio"]');
    const emptyError = 'Enter a quantity; use 0 for no holdings.';
    const decimalError = 'Use unsigned decimal digits without spaces, signs or exponents.';
    let state = await assertFieldError(page, '#portfolio-btc', emptyError);
    assert(state.value === '', 'empty BTC text changed after pointer submission');
    const ethEmpty = await page.evaluate(`(() => {const e=document.querySelector('#portfolio-eth'),ids=(e?.getAttribute('aria-describedby')??'').split(/\\s+/);return {value:e?.value,invalid:e?.getAttribute('aria-invalid'),own:ids.includes('portfolio-eth-error'),text:document.querySelector('#portfolio-eth-error')?.textContent?.trim()};})()`);
    assert(ethEmpty.value === '' && ethEmpty.invalid === 'true' && ethEmpty.own && ethEmpty.text === emptyError, 'empty ETH field-specific error or text changed');
    assert(page.apiRequests('/api/v1/valuation').length === baseline, 'empty invalid pointer submission sent a valuation POST');

    await page.setInput('#portfolio-btc', '0.1');
    const correction = await page.evaluate(`({active:document.activeElement?.id,invalid:document.querySelector('#portfolio-btc')?.getAttribute('aria-invalid')})`);
    assert(correction.active === 'portfolio-btc' && correction.invalid === null, 'correcting BTC did not preserve focus and clear its error');
    await page.setInput('#portfolio-eth', '1e2');
    await page.click('[aria-label="Calculate portfolio"]');
    state = await assertFieldError(page, '#portfolio-eth', decimalError);
    assert(state.value === '1e2', 'invalid ETH text changed after pointer submission');
    assert(page.apiRequests('/api/v1/valuation').length === baseline, 'invalid ETH pointer submission sent a valuation POST');

    await page.setInput('#portfolio-btc', '-1');
    await page.setInput('#portfolio-eth', '2');
    await page.click('[aria-label="Calculate portfolio"]');
    state = await assertFieldError(page, '#portfolio-btc', decimalError);
    assert(state.value === '-1', 'invalid BTC text changed after pointer submission');
    assert(page.apiRequests('/api/v1/valuation').length === baseline, 'invalid BTC pointer submission sent a valuation POST');

    await page.setInput('#portfolio-btc', '');
    await page.setInput('#portfolio-eth', '');
    await page.pressEnter();
    await assertFieldError(page, '#portfolio-btc', emptyError);
    assert(page.apiRequests('/api/v1/valuation').length === baseline, 'invalid keyboard submission sent a valuation POST');

    await page.setInput('#portfolio-btc', '0');
    await page.setInput('#portfolio-eth', '0');
    await page.pressEnter();
    await page.waitFor('valid keyboard valuation', `document.querySelector('.portfolio-total-value')?.textContent?.trim()==='0'`);
    assert(page.apiRequests('/api/v1/valuation').length === baseline + 1, 'valid keyboard submission did not send exactly one valuation POST');
    const focus = await page.evaluate(`document.activeElement?.id`);
    assert(focus === 'portfolio-eth', 'successful response stole focus from the submitting ETH field');
    page.assertHealthy('invalid form');
    console.log('PASS invalid form pointer/keyboard focus and request counts');
  }));
}

async function runOtherFixture(scenario) {
  await withFixture(scenario, () => withPage(1024, async page => {
    await assertInitial(page, scenario);
    await manualRefresh(page, scenario);
    await calculate(page, '0.1', '2', 1);
    const text = await page.bodyText();
    const scoped = await page.evaluate(`(() => {const rows=[...document.querySelectorAll('.asset-valuation-row')].map(row=>({heading:row.querySelector('h4')?.innerText??'',text:row.innerText}));return {btc:document.querySelector('[aria-labelledby="market-BTC"]')?.innerText??'',eth:document.querySelector('[aria-labelledby="market-ETH"]')?.innerText??'',portfolio:document.querySelector('[aria-labelledby="portfolio-title"]')?.innerText??'',btcHolding:rows.find(row=>row.heading.includes('BTC'))?.text??'',ethHolding:rows.find(row=>row.heading.includes('ETH'))?.text??''};})()`);
    assert(scoped.portfolio.includes('Incomplete estimate') && scoped.portfolio.includes('Unavailable'), `${scenario}: incomplete valuation not shown`);
    assert(!scoped.portfolio.includes('11500.01200002') && !scoped.portfolio.includes('56.52%') && !scoped.portfolio.includes('43.48%'), `${scenario}: unsupported total/allocation displayed`);
    assert(text.includes('Synthetic fixture data') && /prices and timestamps are simulated/i.test(text) && /Synthetic fixture data · demonstration estimates/i.test(scoped.portfolio), `${scenario}: synthetic warnings disappeared`);
    const allocations = await page.evaluate(`[...document.querySelectorAll('.asset-valuation-details')].map(row=>[...row.querySelectorAll('div')].find(item=>item.querySelector('dt')?.textContent==='Allocation')?.querySelector('dd')?.textContent?.trim())`);
    assert(allocations.length === 2 && allocations.every(value => value === 'Unavailable'), `${scenario}: fabricated allocation displayed`);
    if (scenario === 'partial') {
      assert(scoped.btc.includes('65000.12') && scoped.btcHolding.includes('65000.12') && scoped.btcHolding.includes('6500.012') && /Market data request timed out/i.test(scoped.eth) && /Quote unavailable/i.test(scoped.ethHolding), 'partial: expected BTC value and missing ETH explanation absent');
    } else if (scenario === 'stale') {
      assert(/Stale/i.test(scoped.btc) && /Stale/i.test(scoped.eth) && [scoped.btcHolding, scoped.ethHolding].every(row => /Stale observed price/i.test(row) && /Quote stale/i.test(row)) && /Market data request timed out/i.test(scoped.btc) && /Market data request timed out/i.test(scoped.eth), 'stale: both markets/holdings did not expose stale outcomes');
    } else if (scenario === 'timeout') {
      assert(/Market data request timed out/i.test(scoped.btc) && /Market data request timed out/i.test(scoped.eth) && [scoped.btcHolding, scoped.ethHolding].every(row => /Quote unavailable/i.test(row)), 'timeout: timeout/missing explanation absent');
    } else if (scenario === 'rate-limit') {
      assert(/Market data rate limited/i.test(scoped.btc) && /Provider rate limited/i.test(text) && /Not attempted/i.test(scoped.eth) && /Remaining ETH refresh was not attempted/i.test(text) && [scoped.btcHolding, scoped.ethHolding].every(row => /Quote unavailable/i.test(row) && /Holding value\s+Unavailable/i.test(row)), 'rate-limit: rate-limit/not-attempted/missing-quote outcome absent');
    } else {
      assert(/Market data provider unavailable.*503/i.test(scoped.btc) && /Market data provider unavailable.*503/i.test(scoped.eth) && [scoped.btcHolding, scoped.ethHolding].every(row => /Quote unavailable/i.test(row)), 'unavailable: provider 503/missing explanation absent');
    }
    const refreshCount = page.apiRequests('/api/v1/refresh').length;
    await delay(300);
    assert(page.apiRequests('/api/v1/refresh').length === refreshCount && refreshCount === 1, `${scenario}: automatic refresh/retry detected`);
    assert(page.apiRequests('/api/v1/dashboard').length === 1 && page.apiRequests('/api/v1/valuation').length === 1, `${scenario}: unexpected API request count`);
    page.assertHealthy(scenario);
    console.log(`PASS fixture ${scenario}`);
  }));
}

async function runIntentionalFailure() {
  await withFixture('success', () => withPage(320, async page => {
    await assertInitial(page, 'success');
    page.assertHealthy('intentional-failure readiness');
    fail('intentional failure control after browser and fixture readiness');
  }));
}

async function cleanup() {
  for (const pageTarget of []) void pageTarget;
  if (chromeProcess && !childClosed(chromeProcess) && cdpPort !== null) {
    try {
      const initialRoot = chromeProcess.recordedTree?.find(record => record.pid === chromeProcess.child.pid) ?? null;
      chromeProcess.recordedTree = await windowsProcessTree(chromeProcess.child.pid, 'Chrome', initialRoot, true) ?? chromeProcess.recordedTree;
      const version = await fetch(`http://127.0.0.1:${cdpPort}/json/version`, { signal: AbortSignal.timeout(500) }).then(response => response.json());
      if (version.webSocketDebuggerUrl) {
        const browser = new CdpClient(version.webSocketDebuggerUrl.replace('localhost', '127.0.0.1'));
        await browser.connect();
        try { await browser.send('Browser.close', {}, 2_000); } finally { browser.close(); }
      }
    } catch { /* Owned-process termination below remains bounded. */ }
  }
  try { await stopOwned(chromeProcess, true); } catch (error) { cleanupErrors.push(error); }
  try { await stopOwned(viteProcess, true); } catch (error) { cleanupErrors.push(error); }
  for (const item of [...owned].reverse()) {
    if (item !== chromeProcess && item !== viteProcess) {
      try { await stopOwned(item); } catch (error) { cleanupErrors.push(error); }
    }
  }
  for (const [port, label] of [[API_PORT, 'Rust fixture'], [VITE_PORT, 'Vite'], ...(cdpPort === null ? [] : [[cdpPort, 'Chrome CDP']])]) {
    try { await waitPortFree(port, label); } catch (error) { cleanupErrors.push(error); }
  }
  if (chromeProfile) {
    try { await rm(chromeProfile, { recursive: true, force: true }); } catch (error) { cleanupErrors.push(new Error(`isolated Chrome profile cleanup failed: ${safeMessage(error)}`)); }
  }
}

async function main() {
  assert(resolve(process.cwd()) === FRONTEND, 'browser harness must run from the frontend workspace');
  assert(process.versions.node.startsWith('24.'), `Node.js 24 is required, found ${process.version}`);
  const selectedControls = [INTENTIONAL_FAILURE, FOCUSED_TESTS, COMBINED_FAILURE_CONTROL].filter(Boolean).length;
  assert(selectedControls <= 1, 'select at most one browser harness control mode');
  if (FOCUSED_TESTS) return runFocusedTests();
  if (COMBINED_FAILURE_CONTROL) {
    cleanupErrors.push(new Error(`${tmpdir()} intentional cleanup failure control`));
    fail(`${ROOT} intentional primary failure control`);
  }
  await requirePortFree(API_PORT);
  await requirePortFree(VITE_PORT);
  artifactDirectory = await mkdtemp(join(tmpdir(), 'rust-crypto-m34-b4-'));
  await startVite();
  await startChrome();
  if (INTENTIONAL_FAILURE) return runIntentionalFailure();
  for (const width of VIEWPORTS) await runSuccess(width);
  await runInvalidForm();
  for (const scenario of OTHER_FIXTURES) await runOtherFixture(scenario);
  ensureActive();
  console.log(`PASS all browser scenarios; screenshots: ${artifactDirectory}`);
}

let failure = null;
try {
  await main();
} catch (error) {
  failure = error;
} finally {
  try {
    await cleanup();
  } catch (error) {
    cleanupErrors.push(new Error(`cleanup orchestration failed: ${safeMessage(error)}`));
  }
}
if (cleanupErrors.length === 0) {
  console.log('PASS cleanup: owned processes stopped; recorded process trees ended; ports 3000, 5173 and CDP are closed; Chrome profile removed');
}
const diagnostics = failureDiagnostics(failure, cleanupErrors);
if (diagnostics.length) {
  for (const diagnostic of diagnostics) console.error(`FAIL ${diagnostic}`);
  process.exitCode = 1;
}
