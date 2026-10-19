import { useEffect, useRef, useState } from 'react';
import { ApiClientError, getDashboard, refreshMarkets } from './api/client';
import type { Dashboard, Market } from './api/contracts';
import { marketViews, nextDisplayDelay, remainingCooldown, type TimedDashboard } from './dashboard-model';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ModeNotice } from './components/ModeNotice';
import { MarketOverview } from './components/MarketOverview';
import { ProviderHealth } from './components/ProviderHealth';
import { RefreshControl } from './components/RefreshControl';

type Operation = 'initial' | 'refresh' | 'read';
type Connectivity = 'loading' | 'connected' | 'disconnected';
const emptyMarkets: readonly Market[] = (['BTC/USDT', 'ETH/USDT'] as const).map(pair => ({
  pair, state: 'unavailable', observation: null, observation_age_ms: null,
  last_attempt_at_ms: null, last_success_at_ms: null, attempt_state: 'not_attempted', last_error: null,
}));

function outcome(dashboard: Dashboard): string {
  if (dashboard.service_state !== 'ready') return dashboard.service_error?.message ?? 'The backend is stopping.';
  if (dashboard.refresh_in_progress) return 'Backend refresh is still in progress. Read backend state explicitly to check again.';
  if (dashboard.markets.some(market => market.last_error?.code === 'provider_rate_limited')) {
    return 'Provider rate limited. Review per-market attempts and the server cooldown.';
  }
  return dashboard.markets.some(market => market.attempt_state === 'failed')
    ? 'Refresh completed with provider errors. Review each market below.'
    : 'Refresh completed. Review the observed market outcomes below.';
}

export function App() {
  const [connectivity, setConnectivity] = useState<Connectivity>('loading');
  const [snapshot, setSnapshot] = useState<TimedDashboard | null>(null);
  const [pending, setPending] = useState<Operation | null>('initial');
  const [valid, setValid] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [feedback, setFeedback] = useState('Reading the current snapshot. No provider request is made.');
  const [serviceMessage, setServiceMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<{ milliseconds: string; receivedAt: number } | null>(null);
  const [now, setNow] = useState(() => performance.now());
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  const generation = useRef(0);
  const visibilityEpoch = useRef(0);
  const alive = useRef(false);
  const operation = useRef<Operation | null>(null);
  const controller = useRef<AbortController | null>(null);

  function accept(dashboard: Dashboard, requestedAt: number, requestedEpoch: number) {
    const receivedAt = performance.now();
    setSnapshot({ dashboard, requestedAt, receivedAt });
    setCooldown({ milliseconds: dashboard.refresh_allowed_in_ms, receivedAt });
    setNow(receivedAt);
    setConnectivity('connected');
    setValid(requestedEpoch === visibilityEpoch.current && document.visibilityState !== 'hidden');
    setUncertain(false);
    setServiceMessage(null);
  }

  async function execute(kind: Operation) {
    // A user refresh may supersede the initial read, never another user operation.
    if (!alive.current || (operation.current !== null && !(kind === 'refresh' && operation.current === 'initial'))) return;
    controller.current?.abort();
    const current = ++generation.current;
    let abortController = new AbortController();
    controller.current = abortController;
    operation.current = kind;
    setPending(kind);
    setValid(false);
    setFeedback(kind === 'refresh'
      ? 'Refresh in progress. Previously observed quotes are not current.'
      : 'Reading backend state without requesting provider data.');
    const isCurrent = () => alive.current && generation.current === current && !abortController.signal.aborted;
    const requestedAt = performance.now();
    const requestedEpoch = visibilityEpoch.current;
    try {
      const dashboard = await (kind === 'refresh' ? refreshMarkets(abortController.signal) : getDashboard(abortController.signal));
      if (!isCurrent()) return;
      accept(dashboard, requestedAt, requestedEpoch);
      setFeedback(kind === 'refresh' ? outcome(dashboard) :
        dashboard.refresh_in_progress ? outcome(dashboard) : 'Backend snapshot read. No provider refresh was requested.');
    } catch (error) {
      if (!isCurrent()) return;
      const failure = error instanceof ApiClientError ? error : new ApiClientError('disconnected');
      if (failure.kind === 'aborted') return;
      if (kind === 'refresh' && (failure.status === 504 || failure.kind === 'timeout')) {
        // The admitted backend operation may continue. Reconcile once with GET only.
        setUncertain(true);
        setPending('read');
        operation.current = 'read';
        setFeedback('Refresh waiter timed out; backend work may continue. Reading backend state once.');
        abortController = new AbortController();
        controller.current = abortController;
        const readStartedAt = performance.now();
        const readEpoch = visibilityEpoch.current;
        try {
          const dashboard = await getDashboard(abortController.signal);
          if (!isCurrent()) return;
          accept(dashboard, readStartedAt, readEpoch);
          setFeedback('Refresh waiter timed out. Backend state was read once. ' +
            (dashboard.refresh_in_progress ? outcome(dashboard) : 'Review per-market outcomes; no refresh was retried.'));
        } catch {
          if (!isCurrent()) return;
          setConnectivity('disconnected');
          setUncertain(true);
          setFeedback('Refresh outcome is uncertain. The read-only reconciliation failed; backend work may continue. Use Read backend state.');
        }
      } else if (failure.kind === 'http_error') {
        setConnectivity('connected');
        if (failure.status === 429) {
          setCooldown({ milliseconds: failure.retryAfterMs ?? '0', receivedAt: performance.now() });
          setNow(performance.now());
          setFeedback('Server refresh cooldown is active. Wait, then choose Refresh markets explicitly.');
        } else {
          setUncertain(true);
          const message = failure.safeError?.message ?? 'The API rejected the request.';
          setServiceMessage(message);
          setFeedback(message + '. Read backend state before another refresh.');
        }
      } else {
        setConnectivity('disconnected');
        setUncertain(kind === 'refresh' || kind === 'read');
        setFeedback(failure.kind === 'invalid_response'
          ? 'API response invalid or unsupported. Previously observed data is not current. Use Read backend state.'
          : failure.kind === 'timeout'
            ? 'API request deadline expired. Use Read backend state to reconnect.'
            : 'API disconnected. Previously observed data is not current. Check the local servers and use Read backend state.');
      }
    } finally {
      if (alive.current && generation.current === current) {
        operation.current = null;
        setPending(null);
      }
    }
  }

  useEffect(() => {
    alive.current = true;
    void execute('initial');
    return () => {
      alive.current = false;
      ++generation.current;
      operation.current = null;
      controller.current?.abort();
    };
  }, []);

  useEffect(() => {
    const resume = () => {
      const isVisible = document.visibilityState !== 'hidden';
      setVisible(isVisible);
      setNow(performance.now());
      if (isVisible) {
        ++visibilityEpoch.current;
        setValid(false);
        setFeedback('Tab resumed. Previously observed data is not current; read backend state or refresh explicitly.');
      }
    };
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const delay = nextDisplayDelay(valid ? snapshot : null, cooldown, now);
    if (delay === null) return;
    const timer = globalThis.setTimeout(() => setNow(performance.now()), delay);
    return () => globalThis.clearTimeout(timer);
  }, [snapshot, cooldown, now, valid, visible]);

  const dashboard = snapshot?.dashboard;
  const current = valid && connectivity === 'connected' && pending === null &&
    !uncertain && dashboard?.service_state === 'ready' && !dashboard.refresh_in_progress;
  const remaining = cooldown ? remainingCooldown(cooldown.milliseconds, cooldown.receivedAt, now) : 0n;
  const views = snapshot ? marketViews(snapshot, now, current, pending === 'refresh') :
    emptyMarkets.map(market => ({ market, stateLabel: 'Unavailable', ageLabel: 'Snapshot unavailable', previous: false }));
  const disabled = (pending !== null && pending !== 'initial') || remaining > 0n || uncertain ||
    connectivity === 'disconnected' || (dashboard !== undefined &&
      (dashboard.service_state !== 'ready' || dashboard.service_error !== null || dashboard.refresh_in_progress));
  const canRead = pending === null && (!valid || uncertain || connectivity === 'disconnected' ||
    dashboard?.refresh_in_progress === true || dashboard?.service_state !== 'ready');

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">RC</span>
          <div><p className="eyebrow">LOCAL WORKSPACE</p><h1>Rust Crypto Monitor</h1></div>
        </div>
        <span className="read-only-label">Public, read-only market data</span>
      </header>
      <main id="main-content" tabIndex={-1}>
        <section className="intro" aria-labelledby="workspace-title">
          <p className="eyebrow">MARKET WORKSPACE</p>
          <h2 id="workspace-title">Clarity in every observation.</h2>
          <p className="intro-copy">Exact market prices from your Rust API, with explicit refresh and transparent provider outcomes.</p>
        </section>
        <ConnectionStatus state={connectivity} serviceState={valid ? dashboard?.service_state : undefined} />
        {dashboard ? <ModeNotice dashboard={dashboard} /> :
          <section className="panel message-panel" aria-busy={pending !== null}>
            <h2>{connectivity === 'loading' ? 'Reading the current snapshot' : 'The snapshot is unavailable'}</h2>
            <p>Mode and provider observations are unavailable until a validated local API response is received.</p>
          </section>}
        <MarketOverview markets={views} pending={pending === 'refresh'} />
        <RefreshControl disabled={disabled} pending={pending === 'refresh'} reconciling={pending === 'read'}
          cooldownSeconds={remaining > 0n ? ((remaining + 999n) / 1000n).toString() : null}
          message={feedback} onRefresh={() => { void execute('refresh'); }}
          onReconcile={canRead ? () => { void execute('read'); } : undefined} />
        {dashboard ? (
          <>
            <ProviderHealth dashboard={dashboard} snapshotCurrent={current} pending={pending === 'refresh'} serviceMessage={serviceMessage} />
            <section className="snapshot-meta" aria-label="Snapshot identity">
              <p>Snapshot ID <code>{dashboard.snapshot_id}</code> · Schema {dashboard.schema_version}</p>
              <p>{current ? 'Accepted backend snapshot' : 'Previously read snapshot; current backend state is unconfirmed'}</p>
            </section>
          </>
        ) : <section className="panel message-panel"><h2>Provider Health</h2><p>No observed provider outcomes are available.</p></section>}
      </main>
      <footer className="app-footer"><span>Local API · Rust + React</span><span>No automatic refresh, retries or polling.</span></footer>
    </div>
  );
}
export default App;
