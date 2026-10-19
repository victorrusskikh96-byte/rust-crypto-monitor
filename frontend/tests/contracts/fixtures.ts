export const fixtureNotice = 'Synthetic fixture data: prices and timestamps are simulated; health describes simulated local outcomes, not Binance availability.';

export function dashboard(mode: 'real' | 'fixture' = 'fixture') {
  return {
    schema_version: 1,
    mode,
    snapshot_id: 'opaque-token-0',
    freshness_ttl_ms: '60000',
    refresh_in_progress: false,
    service_state: 'ready',
    service_error: null,
    refresh_allowed_in_ms: '0',
    markets: ['BTC/USDT', 'ETH/USDT'].map(pair => ({
      pair,
      state: 'unavailable',
      observation: null,
      observation_age_ms: null,
      last_attempt_at_ms: null,
      last_success_at_ms: null,
      attempt_state: 'not_attempted',
      last_error: null,
    })),
    ...(mode === 'fixture' ? { provenance: 'fixture', fixture: { scenario: 'success', notice: fixtureNotice } } : {}),
  };
}

export function observedDashboard() {
  const value: Record<string, unknown> = dashboard();
  value.markets = ['BTC/USDT', 'ETH/USDT'].map(pair => ({
    pair, state: 'success',
    observation: {price: pair === 'BTC/USDT' ? '65000.1200000000000000000001' : '2500.00000001', quote: 'USDT', provider: 'Binance', observed_at_ms: '-1', provenance: 'fixture'},
    observation_age_ms: '0', last_attempt_at_ms: '-1', last_success_at_ms: '-1', attempt_state: 'success', last_error: null,
  }));
  return value;
}
