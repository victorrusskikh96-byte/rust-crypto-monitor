import type { Dashboard } from '../api/contracts';
import { attemptLabel } from './MarketCard';

type ProviderHealthProps = {
  dashboard: Dashboard;
  snapshotCurrent: boolean;
  pending: boolean;
  serviceMessage: string | null;
};

export function ProviderHealth({ dashboard, snapshotCurrent, pending, serviceMessage }: ProviderHealthProps) {
  const fixture = dashboard.mode === 'fixture';
  const btcRateLimited = dashboard.markets[0]?.last_error?.code === 'provider_rate_limited' && !dashboard.refresh_in_progress && !pending;
  const workerLabel = dashboard.service_state === 'ready' ? 'Ready' : dashboard.service_state === 'stopping' ? 'Stopping' : 'Unavailable / failed';

  return (
    <section className="panel health-panel" aria-labelledby="provider-health-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">WORKER & PROVIDER OUTCOMES</p>
          <h2 id="provider-health-title">Provider Health</h2>
        </div>
        <span className="mode-badge">{fixture ? 'Simulated outcomes' : 'Observed outcomes'}</span>
      </div>
      <p className="health-description">{fixture ? 'Fixture health is simulated and does not establish Binance availability.' : 'Provider health reflects recorded requests only; local API readiness does not establish Binance availability.'}</p>
      <div className="worker-summary">
        <span className="health-label">Backend worker</span>
        <strong>{workerLabel}{snapshotCurrent ? '' : ' · last known state'}</strong>
        <span>{pending || dashboard.refresh_in_progress ? 'Refresh in progress' : 'No refresh in progress in this snapshot'}</span>
      </div>
      {serviceMessage && <p className="service-message">{serviceMessage}</p>}
      {dashboard.service_error && <p className="service-message">{dashboard.service_error.message}.</p>}
      {!snapshotCurrent && <p className="health-history">This snapshot is retained history. Current worker and provider outcomes are unconfirmed.</p>}
      <ul className="provider-list">
        {dashboard.markets.map(market => <li key={market.pair} className="provider-row">
          <div className="provider-row-heading">
            <h3>{market.pair}</h3>
            <span>{fixture ? 'Synthetic fixture' : 'Binance'}</span>
          </div>
          <p className="provider-outcome">{btcRateLimited && market.pair === 'ETH/USDT' ? 'Not attempted in the recorded refresh batch' : attemptLabel(market.attempt_state)}</p>
          {btcRateLimited && market.pair === 'ETH/USDT' && <p>Remaining ETH refresh was not attempted after BTC rate limiting; prior attempt details are retained.</p>}
          {market.last_error && <p>{market.last_error_is_previous ? 'Previous recorded error: ' : 'Recorded error: '}{market.last_error.message}{market.last_error.status !== undefined ? ` (HTTP ${market.last_error.status})` : ''}.</p>}
          {market.attempt_state === 'not_attempted' && !(btcRateLimited && market.pair === 'ETH/USDT') && <p>No provider request has been recorded for this market.</p>}
          {market.attempt_state === 'success' && <p>{btcRateLimited && market.pair === 'ETH/USDT' ? 'Prior successful observation retained.' : 'The recorded request succeeded; this is not a continuous availability check.'}</p>}
          <dl className="provider-timestamps">
            <div>
              <dt>{fixture ? 'Last synthetic attempt (Unix ms)' : 'Last recorded attempt (Unix ms)'}</dt>
              <dd>{market.last_attempt_at_ms === null ? 'None recorded' : <code>{market.last_attempt_at_ms}</code>}</dd>
            </div>
            <div>
              <dt>{fixture ? 'Last synthetic success receipt (Unix ms)' : 'Last successful receipt (Unix ms)'}</dt>
              <dd>{market.last_success_at_ms === null ? 'None recorded' : <code>{market.last_success_at_ms}</code>}</dd>
            </div>
          </dl>
        </li>)}
      </ul>
      <p className="health-footnote">No automatic provider requests, retries or polling. Refresh admission and cooldown are controlled by the Rust backend.</p>
    </section>
  );
}
