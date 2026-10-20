import type { MarketView } from '../dashboard-model';

type MarketCardProps = { view: MarketView };

export function attemptLabel(state: MarketView['market']['attempt_state']): string {
  switch (state) {
    case 'loading': return 'Refresh in progress';
    case 'success': return 'Successful observation';
    case 'failed': return 'Refresh failed';
    case 'not_attempted': return 'Not attempted';
  }
}

export function MarketCard({ view }: MarketCardProps) {
  const { market, stateLabel, ageLabel, previous } = view;
  const observation = market.observation;
  const asset = market.pair === 'BTC/USDT' ? 'Bitcoin' : 'Ethereum';
  const fixture = observation?.provenance === 'fixture';
  const timestampLabel = fixture ? 'Synthetic receipt timestamp (Unix ms)' : 'Observation receipt timestamp (Unix ms)';
  const error = market.last_error;

  return (
    <article className={`market-card panel${previous ? ' market-previous' : ''}`} aria-labelledby={`market-${market.pair.slice(0, 3)}`}>
      <div className="market-card-heading">
        <div>
          <p className="eyebrow">{asset}</p>
          <h3 id={`market-${market.pair.slice(0, 3)}`}>{market.pair}</h3>
        </div>
        <span className={`observation-badge${stateLabel.toLowerCase().includes('stale') ? ' observation-stale' : ''}`}>
          <span className="status-dot" aria-hidden="true" />{stateLabel}
        </span>
      </div>

      <p className={`market-price${observation ? '' : ' price-unavailable'}`}>
        <span className="price-value">{observation?.price ?? 'Unavailable'}</span>
        <span className="quote-currency">USDT</span>
      </p>
      <p className="market-age">{ageLabel}</p>
      {previous && <p className="previous-observation">Previously observed data; current market state is unconfirmed.</p>}
      {fixture && <p className="synthetic-label">Synthetic fixture price</p>}

      <dl className="market-details">
        <div>
          <dt>Data source</dt>
          <dd>{observation ? (fixture ? 'Binance-shaped synthetic fixture' : 'Binance public market data') : 'No observation received'}</dd>
        </div>
        <div>
          <dt>Last successful observation</dt>
          <dd>{market.last_success_at_ms === null ? 'None recorded' : <><span>{timestampLabel}</span><code>{market.last_success_at_ms}</code></>}</dd>
        </div>
        <div>
          <dt>Latest refresh outcome</dt>
          <dd>{attemptLabel(market.attempt_state)}</dd>
        </div>
        {market.last_attempt_at_ms !== null && <div>
          <dt>{fixture ? 'Synthetic attempt timestamp (Unix ms)' : 'Attempt receipt timestamp (Unix ms; synthetic in fixture mode)'}</dt>
          <dd><code>{market.last_attempt_at_ms}</code></dd>
        </div>}
      </dl>
      {error && <div className="market-error">
        <p>{market.last_error_is_previous ? 'Previous attempt: ' : 'Latest recorded failure: '}{error.message}{error.status !== undefined ? ` (HTTP ${error.status})` : ''}.</p>
        {error.retry_after_seconds !== undefined && <p>Provider Retry-After: {error.retry_after_seconds} seconds. Refresh remains subject to backend cooldown.</p>}
      </div>}
    </article>
  );
}
