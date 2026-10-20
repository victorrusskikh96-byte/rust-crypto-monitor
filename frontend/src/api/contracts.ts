export type FixtureScenario = 'success' | 'partial' | 'stale' | 'timeout' | 'rate-limit' | 'unavailable';
export type Asset = 'BTC' | 'ETH';
export type Quantities = Record<Asset, string>;
export type QuantityErrors = Partial<Record<Asset, string>>;
export interface HoldingValuation {
  asset: Asset;
  quantity: string;
  price: string | null;
  value: string | null;
  allocation_pct: string | null;
  reason: 'quote_missing' | 'quote_stale' | null;
}
export interface ValuationBase {
  snapshot_id: string;
  quote: 'USDT';
  state: 'complete' | 'incomplete';
  holdings: readonly HoldingValuation[];
  total: string | null;
  allocation_rounding: 'independent_half_even_2dp';
  estimate: true;
}
export type Valuation = ValuationBase & (
  { mode?: never } |
  { mode: 'fixture'; provenance: 'fixture'; fixture: { scenario: FixtureScenario; notice: string } }
);
export type ServiceState = 'ready' | 'failed' | 'stopping';
export interface SafeError {
  code: string;
  message: string;
  field?: 'quantities.BTC' | 'quantities.ETH';
  status?: number;
  retry_after_seconds?: string;
  retry_after_ms?: string;
}
export interface Observation {
  price: string;
  quote: 'USDT';
  provider: 'Binance';
  observed_at_ms: string | null;
  provenance: 'real' | 'fixture';
}
export interface Market {
  pair: 'BTC/USDT' | 'ETH/USDT';
  state: 'loading' | 'unavailable' | 'success' | 'stale';
  observation: Observation | null;
  observation_age_ms: string | null;
  last_attempt_at_ms: string | null;
  last_success_at_ms: string | null;
  attempt_state: 'loading' | 'failed' | 'success' | 'not_attempted';
  last_error: SafeError | null;
  last_error_is_previous?: true;
}
interface DashboardBase {
  schema_version: 1;
  snapshot_id: string;
  freshness_ttl_ms: string;
  refresh_in_progress: boolean;
  service_state: ServiceState;
  service_error: SafeError | null;
  refresh_allowed_in_ms: string;
  markets: readonly Market[];
}
export type Dashboard = DashboardBase & (
  { mode: 'real' } |
  { mode: 'fixture'; provenance: 'fixture'; fixture: { scenario: FixtureScenario; notice: string } }
);
