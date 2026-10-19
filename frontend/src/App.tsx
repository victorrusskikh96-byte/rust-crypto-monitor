import { useEffect, useRef, useState } from 'react';
import { getDashboard } from './api/client';
import type { Dashboard } from './api/contracts';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ModeNotice } from './components/ModeNotice';

type LoadState =
  | { status: 'loading' }
  | { status: 'connected'; dashboard: Dashboard }
  | { status: 'disconnected' };

export function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const generation = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const requestGeneration = ++generation.current;
    let active = true;

    void getDashboard(controller.signal).then(
      (dashboard) => {
        if (active && !controller.signal.aborted && generation.current === requestGeneration) {
          setState({ status: 'connected', dashboard });
        }
      },
      () => {
        if (active && !controller.signal.aborted && generation.current === requestGeneration) {
          setState({ status: 'disconnected' });
        }
      },
    );

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const dashboard = state.status === 'connected' ? state.dashboard : undefined;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">RC</span>
          <div>
            <p className="eyebrow">LOCAL WORKSPACE</p>
            <h1>Rust Crypto Monitor</h1>
          </div>
        </div>
        <span className="read-only-label">Read-only foundation</span>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="intro" aria-labelledby="workspace-title">
          <p className="eyebrow">CONNECTION OVERVIEW</p>
          <h2 id="workspace-title">Your local market workspace.</h2>
          <p className="intro-copy">A direct connection to your Rust API, with clear data provenance and observed service state.</p>
        </section>

        <ConnectionStatus state={state.status} serviceState={dashboard?.service_state} />

        {state.status === 'loading' && (
          <section className="panel message-panel" aria-labelledby="loading-title" aria-busy="true">
            <h2 id="loading-title">Reading the current snapshot</h2>
            <p>Waiting for the local API. This read does not request market data from Binance.</p>
          </section>
        )}

        {state.status === 'disconnected' && (
          <section className="panel message-panel error-panel" aria-labelledby="error-title">
            <h2 id="error-title">The snapshot is unavailable</h2>
            <p>The local API could not be reached or returned an unsupported response.</p>
            <p className="muted">Check that the local servers are running, then reload this page. No automatic retries are made.</p>
          </section>
        )}

        {dashboard && (
          <>
            <ModeNotice dashboard={dashboard} />
            <section className="panel snapshot-panel" aria-labelledby="snapshot-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">SERVER RESPONSE</p>
                  <h2 id="snapshot-title">Current snapshot</h2>
                </div>
                <span className="schema-label">Schema {dashboard.schema_version}</span>
              </div>
              <dl className="snapshot-details">
                <div className="snapshot-identity">
                  <dt>Snapshot ID</dt>
                  <dd><code>{dashboard.snapshot_id}</code></dd>
                </div>
                <div>
                  <dt>Tracked markets</dt>
                  <dd>{dashboard.markets.map((market) => market.pair).join(' · ')}</dd>
                </div>
                <div>
                  <dt>Refresh state</dt>
                  <dd>{dashboard.refresh_in_progress ? 'Refresh in progress' : 'No refresh in progress'}</dd>
                </div>
              </dl>
              <div className="provider-summary">
                <h3>Provider availability</h3>
                <p>{dashboard.markets.every((market) => market.attempt_state === 'not_attempted')
                  ? 'No provider requests have been made.'
                  : 'Shows observed outcomes only; this is not a global provider availability check.'}</p>
                <p className="muted">Backend readiness describes the local API and worker. It does not establish Binance availability.</p>
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="app-footer">
        <span>Local API · Rust + React</span>
        <span>No automatic refresh, retries or polling.</span>
      </footer>
    </div>
  );
}

export default App;
