import type { Dashboard, HoldingValuation, Market, Observation, SafeError, Valuation } from './contracts';
import { canonicalQuantity, quantityError } from '../portfolio-model';

const fixtureNotice = 'Synthetic fixture data: prices and timestamps are simulated; health describes simulated local outcomes, not Binance availability.';
const scenarios = ['success', 'partial', 'stale', 'timeout', 'rate-limit', 'unavailable'];
const messages: Readonly<Record<string, readonly string[]>> = {
  refresh_in_progress: ['Refresh is in progress'],
  refresh_cooldown: ['Refresh cooldown applies'],
  refresh_wait_timeout: ['Refresh waiter timed out; work may continue'],
  worker_unavailable: ['Market worker is unavailable'],
  worker_failed: ['Market worker failed'],
  cooldown_unrepresentable: ['Refresh disabled until restart'],
  unsupported_pair: ['Unsupported market pair'],
  configuration_error: ['Market data configuration failed'],
  provider_timeout: ['Market data request timed out'],
  provider_transport: ['Market data transport failed'],
  provider_rate_limited: ['Market data rate limited'],
  provider_unavailable: ['Market data provider unavailable'],
  provider_http_status: ['Unexpected market data HTTP status'],
  provider_response_too_large: ['Market data response too large'],
  provider_invalid_data: ['Invalid market data'],
  invalid_request: ['Invalid request'],
  invalid_quantity: ['Enter an unsigned decimal quantity'],
  invalid_host: ['Host is not allowed'],
  invalid_origin: ['Origin is not allowed'],
  not_found: ['Route not found'],
  method_not_allowed: ['Method is not allowed'],
  body_too_large: ['Request body exceeds the limit'],
  unsupported_media_type: ['Use application/json without content encoding'],
  snapshot_replaced: ['Reread the dashboard and explicitly recalculate'],
  arithmetic_capacity: ['Portfolio arithmetic capacity exceeded'],
  unrepresentable_value: ['Exact portfolio value is not representable'],
  overloaded: ['Service is busy'],
  service_stopping: ['Service is stopping'],
  internal_error: ['Internal service error'],
};

function check(condition: unknown): asserts condition {
  if (!condition) throw new Error('Unsupported API response');
}
function object(value: unknown): Record<string, unknown> {
  check(typeof value === 'object' && value !== null && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  check(required.every(key => Object.hasOwn(value, key)));
  check(Object.keys(value).every(key => required.includes(key) || optional.includes(key)));
}
function text(value: unknown, maximum = 128): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}
function unsigned(value: unknown): value is string {
  return text(value, 39) && /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) <= 340282366920938463463374607431768211455n;
}
function timestamp(value: unknown): value is string | null {
  return value === null || (text(value, 40) && /^(0|-?[1-9][0-9]*)$/.test(value) &&
    BigInt(value) >= -170141183460469231731687303715884105728n && BigInt(value) <= 170141183460469231731687303715884105727n);
}
function price(value: unknown): value is string {
  if (!text(value) || !/^[0-9]+(?:\.[0-9]{1,28})?$/.test(value)) return false;
  // Only validate an integer coefficient; financial quantities remain strings.
  const coefficient = BigInt(value.replace('.', ''));
  return coefficient > 0n && coefficient <= 79228162514264337593543950335n;
}
function safeError(value: unknown): SafeError {
  const error = object(value);
  keys(error, ['code', 'message'], ['field', 'status', 'retry_after_seconds', 'retry_after_ms']);
  check(text(error.code) && Object.hasOwn(messages, error.code));
  check(typeof error.message === 'string' && messages[error.code]?.includes(error.message));
  if (Object.hasOwn(error, 'field')) check(error.code === 'invalid_quantity' && typeof error.field === 'string' && ['quantities.BTC', 'quantities.ETH'].includes(error.field));
  if (Object.hasOwn(error, 'status')) {
    check(typeof error.status === 'number' && Number.isInteger(error.status) && error.status >= 100 && error.status <= 599);
    check(['provider_rate_limited', 'provider_unavailable', 'provider_http_status'].includes(error.code));
    if (error.code === 'provider_rate_limited') check(error.status === 418 || error.status === 429);
    if (error.code === 'provider_unavailable') check(error.status >= 500);
  }
  if (Object.hasOwn(error, 'retry_after_seconds')) check(error.code === 'provider_rate_limited' && unsigned(error.retry_after_seconds));
  if (Object.hasOwn(error, 'retry_after_ms')) check(error.code === 'refresh_cooldown' && unsigned(error.retry_after_ms));
  if (error.code === 'invalid_quantity') check(Object.hasOwn(error, 'field'));
  if (['provider_rate_limited', 'provider_unavailable', 'provider_http_status'].includes(error.code)) check(Object.hasOwn(error, 'status'));
  if (error.code === 'refresh_cooldown') check(Object.hasOwn(error, 'retry_after_ms'));
  if (typeof error.retry_after_seconds === 'string') check(BigInt(error.retry_after_seconds) <= 18446744073709551615n);
  return error as unknown as SafeError;
}
function fixture(value: Record<string, unknown>): void {
  check(value.provenance === 'fixture');
  const info = object(value.fixture);
  keys(info, ['scenario', 'notice']);
  check(typeof info.scenario === 'string' && scenarios.includes(info.scenario));
  check(info.notice === fixtureNotice);
}
function observation(value: unknown, mode: unknown): Observation | null {
  if (value === null) return null;
  const data = object(value);
  keys(data, ['price', 'quote', 'provider', 'observed_at_ms', 'provenance']);
  check(price(data.price) && data.quote === 'USDT' && data.provider === 'Binance');
  check(timestamp(data.observed_at_ms) && data.provenance === mode);
  return data as unknown as Observation;
}
function market(value: unknown, pair: string, mode: unknown): Market {
  const data = object(value);
  keys(data, ['pair', 'state', 'observation', 'observation_age_ms', 'last_attempt_at_ms', 'last_success_at_ms', 'attempt_state', 'last_error'], ['last_error_is_previous']);
  check(data.pair === pair && typeof data.state === 'string' && ['loading', 'unavailable', 'success', 'stale'].includes(data.state));
  check(typeof data.attempt_state === 'string' && ['loading', 'failed', 'success', 'not_attempted'].includes(data.attempt_state));
  const observed = observation(data.observation, mode);
  check(data.observation_age_ms === null || unsigned(data.observation_age_ms));
  check(timestamp(data.last_attempt_at_ms) && timestamp(data.last_success_at_ms));
  if (data.last_error !== null) safeError(data.last_error);
  check((observed === null) === (data.observation_age_ms === null));
  check(data.last_success_at_ms === (observed?.observed_at_ms ?? null));
  check((data.state === 'loading') === (data.attempt_state === 'loading'));
  if (data.state === 'unavailable') check(observed === null);
  if (data.state === 'success' || data.state === 'stale') check(observed !== null);
  if (data.state === 'success') check(data.attempt_state === 'success' && data.last_error === null);
  if (data.attempt_state === 'failed') check(data.last_error !== null);
  if (data.attempt_state === 'not_attempted' || data.attempt_state === 'success') check(data.last_error === null);
  if (Object.hasOwn(data, 'last_error_is_previous')) check(data.last_error_is_previous === true && data.attempt_state === 'loading' && data.last_error !== null);
  if (data.attempt_state === 'loading' && data.last_error !== null) check(data.last_error_is_previous === true);
  return data as unknown as Market;
}

export function decodeDashboard(input: unknown): Dashboard {
  const data = object(input);
  check(data.mode === 'real' || data.mode === 'fixture');
  keys(data, ['schema_version', 'mode', 'snapshot_id', 'freshness_ttl_ms', 'refresh_in_progress', 'service_state', 'service_error', 'refresh_allowed_in_ms', 'markets', ...(data.mode === 'fixture' ? ['provenance', 'fixture'] : [])]);
  check(data.schema_version === 1);
  check(text(data.snapshot_id) && /^[\x21-\x7e]+$/.test(data.snapshot_id));
  check(data.freshness_ttl_ms === '60000' && unsigned(data.refresh_allowed_in_ms));
  check(typeof data.refresh_in_progress === 'boolean');
  check(typeof data.service_state === 'string' && ['ready', 'failed', 'stopping'].includes(data.service_state));
  if (data.service_error !== null) safeError(data.service_error);
  if (data.mode === 'fixture') fixture(data);
  check(Array.isArray(data.markets) && data.markets.length === 2);
  market(data.markets[0], 'BTC/USDT', data.mode);
  market(data.markets[1], 'ETH/USDT', data.mode);
  return data as unknown as Dashboard;
}

export function decodeErrorEnvelope(input: unknown): SafeError {
  const data = object(input);
  const isFixture = data.mode === 'fixture';
  keys(data, ['error', ...(isFixture ? ['mode', 'provenance', 'fixture'] : [])]);
  if (isFixture) fixture(data);
  return safeError(data.error);
}

function decimal(value: unknown, positive = false): value is string {
  if (!text(value, 59) || !/^(0|[1-9][0-9]*)(?:\.[0-9]{0,27}[1-9])?$/.test(value)) return false;
  const coefficient = BigInt(value.replace('.', ''));
  return coefficient <= 79228162514264337593543950335n && (!positive || coefficient > 0n);
}

function holdingValuation(input: unknown, asset: 'BTC' | 'ETH'): HoldingValuation {
  const data = object(input);
  keys(data, ['asset', 'quantity', 'price', 'value', 'allocation_pct', 'reason']);
  check(data.asset === asset && typeof data.quantity === 'string');
  check(quantityError(data.quantity) === null && canonicalQuantity(data.quantity) === data.quantity);
  check(data.price === null || decimal(data.price, true));
  check(data.value === null || decimal(data.value));
  check(data.allocation_pct === null || (text(data.allocation_pct, 6) &&
    /^(?:[0-9]|[1-9][0-9])\.[0-9]{2}$|^100\.00$/.test(data.allocation_pct)));
  check(data.reason === null || data.reason === 'quote_missing' || data.reason === 'quote_stale');
  if (data.quantity === '0') check(data.value === '0' && data.reason === null);
  else if (data.reason !== null) {
    check(data.value === null && data.allocation_pct === null);
    check(data.reason === 'quote_missing' ? data.price === null : data.price !== null);
  } else check(data.price !== null && data.value !== null && data.value !== '0');
  return data as unknown as HoldingValuation;
}

export function decodeValuation(input: unknown): Valuation {
  const data = object(input);
  const isFixture = data.mode === 'fixture';
  keys(data, ['snapshot_id', 'quote', 'state', 'holdings', 'total', 'allocation_rounding', 'estimate',
    ...(isFixture ? ['mode', 'provenance', 'fixture'] : [])]);
  check(text(data.snapshot_id) && /^[\x21-\x7e]+$/.test(data.snapshot_id));
  check(data.quote === 'USDT' && (data.state === 'complete' || data.state === 'incomplete'));
  check(data.allocation_rounding === 'independent_half_even_2dp' && data.estimate === true);
  if (isFixture) fixture(data);
  check(Array.isArray(data.holdings) && data.holdings.length === 2);
  const holdings = [holdingValuation(data.holdings[0], 'BTC'), holdingValuation(data.holdings[1], 'ETH')];
  check(data.total === null || decimal(data.total));
  if (data.state === 'incomplete') {
    check(data.total === null && holdings.some(holding => holding.reason !== null));
    check(holdings.every(holding => holding.allocation_pct === null));
  } else {
    check(data.total !== null && holdings.every(holding => holding.reason === null && holding.value !== null));
    const allZero = holdings.every(holding => holding.quantity === '0');
    check((data.total === '0') === allZero);
    check(holdings.every(holding => allZero ? holding.allocation_pct === null : holding.allocation_pct !== null));
    // These are structural zero invariants, not a duplicate valuation calculation.
    if (!allZero) check(holdings.every(holding => holding.quantity !== '0' || holding.allocation_pct === '0.00'));
  }
  return data as unknown as Valuation;
}
