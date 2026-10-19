import { describe, expect, it } from 'vitest';
import { decodeDashboard, decodeErrorEnvelope } from '../../src/api/decode';
import { dashboard, observedDashboard } from './fixtures';

describe('Rust dashboard runtime contract', () => {
  it.each(['real', 'fixture'] as const)('accepts the actual empty %s snapshot', mode => {
    expect(decodeDashboard(dashboard(mode))).toEqual(dashboard(mode));
  });
  it('preserves exact decimal strings, signed time labels and opaque snapshot tokens', () => {
    const value = observedDashboard();
    value.snapshot_id = 'do-not-parse-this';
    expect(decodeDashboard(value)).toEqual(value);
  });
  it.each([
    ['schema_version', 2], ['schema_version', '1'], ['mode', 'demo'],
    ['snapshot_id', null], ['freshness_ttl_ms', 60000], ['freshness_ttl_ms', '-1'],
    ['refresh_in_progress', 'false'], ['service_state', 'healthy'],
    ['refresh_allowed_in_ms', '1.5'], ['service_error', {code:'raw',message:'sensitive payload'}],
  ])('rejects invalid %s (%j)', (key, value) => {
    expect(() => decodeDashboard({...dashboard(), [key]: value})).toThrow();
  });
  it('rejects each missing required top-level field', () => {
    for (const key of Object.keys(dashboard())) {
      const value: Record<string, unknown> = dashboard();
      delete value[key];
      expect(() => decodeDashboard(value), key).toThrow();
    }
  });
  it.each([null, [], {}, 'raw response'])('rejects non-contract roots %j', value => {
    expect(() => decodeDashboard(value)).toThrow();
  });
  it('rejects missing, extra and duplicate markets', () => {
    const value = dashboard();
    for (const markets of [[], [value.markets[0]], [...value.markets, value.markets[0]], [value.markets[0], value.markets[0]]]) {
      expect(() => decodeDashboard({...value, markets})).toThrow();
    }
  });
  it.each([
    ['pair', 'SOL/USDT'], ['state', 'healthy'], ['attempt_state', 'pending'],
    ['observation_age_ms', -1], ['observation_age_ms', '-1'], ['last_attempt_at_ms', 123],
    ['last_success_at_ms', 'yesterday'], ['observation', {}], ['last_error', {code:'unexpected',message:'raw'}],
  ])('rejects invalid market %s', (key, field) => {
    const value = dashboard();
    expect(() => decodeDashboard({...value, markets: [{...value.markets[0], [key]:field}, value.markets[1]]})).toThrow();
  });
  it.each([
    ['price', 65000.12], ['price', '1e3'], ['price', '-1'], ['price', '0'],
    ['quote', 'USD'], ['provider', 'other'], ['observed_at_ms', 123], ['provenance', 'real'],
  ])('rejects invalid observation %s', (key, field) => {
    const value = observedDashboard();
    const markets = value.markets as Array<Record<string,unknown>>;
    const first = markets[0]!;
    expect(() => decodeDashboard({...value, markets: [{...first, observation: {...first.observation as object,[key]:field}}, markets[1]]})).toThrow();
  });
  it('rejects fixture provenance leakage into real mode and incomplete fixture notices', () => {
    expect(() => decodeDashboard({...dashboard('real'), fixture:{scenario:'success',notice:'fake'}})).toThrow();
    expect(() => decodeDashboard({...dashboard(), fixture:{scenario:'unknown',notice:'fake'}})).toThrow();
    expect(() => decodeDashboard({...dashboard(), fixture:{scenario:'success',notice:''}})).toThrow();
    expect(() => decodeDashboard({...dashboard(), provenance:'real'})).toThrow();
  });
  it('accepts the safe error envelope and rejects raw/untyped errors', () => {
    const error = {code:'invalid_origin',message:'Origin is not allowed'};
    expect(decodeErrorEnvelope({error})).toEqual(error);
    for (const value of [{},{schema_version:1,error},{error:{code:'evil',message:'secret'}},{error:{code:'invalid_origin',message:7}}]) {
      expect(() => decodeErrorEnvelope(value)).toThrow();
    }
  });
  it('rejects unknown fields at every runtime boundary', () => {
    const value = dashboard();
    expect(() => decodeDashboard({...value, raw:'untrusted'})).toThrow();
    expect(() => decodeDashboard({...value,markets:[{...value.markets[0],raw:'untrusted'},value.markets[1]]})).toThrow();
    expect(() => decodeErrorEnvelope({error:{code:'invalid_origin',message:'Origin is not allowed',raw:'untrusted'}})).toThrow();
  });
  it('enforces the Rust 96-bit price coefficient and 28 fractional-digit boundaries', () => {
    const value = observedDashboard();
    const markets = value.markets as Array<Record<string,unknown>>;
    for (const price of ['79228162514264337593543950335','0.0000000000000000000000000001']) {
      const first = {...markets[0],observation:{...markets[0]!.observation as object,price}};
      expect(() => decodeDashboard({...value,markets:[first,markets[1]]})).not.toThrow();
    }
    for (const price of ['79228162514264337593543950336','0.00000000000000000000000000001','1'.repeat(129)]) {
      const first = {...markets[0],observation:{...markets[0]!.observation as object,price}};
      expect(() => decodeDashboard({...value,markets:[first,markets[1]]})).toThrow();
    }
  });
  it('accepts nullable timestamp labels and preserves string age bounds', () => {
    const value = observedDashboard();
    const markets = value.markets as Array<Record<string,unknown>>;
    const first = {...markets[0],observation:{...markets[0]!.observation as object,observed_at_ms:null},last_attempt_at_ms:null,last_success_at_ms:null};
    expect(() => decodeDashboard({...value,markets:[first,markets[1]]})).not.toThrow();
    expect(() => decodeDashboard({...value,refresh_allowed_in_ms:'340282366920938463463374607431768211456'})).toThrow();
  });
  it.each([
    {code:'invalid_quantity',message:'Enter an unsigned decimal quantity'},
    {code:'refresh_cooldown',message:'Refresh cooldown applies'},
    {code:'provider_rate_limited',message:'Market data rate limited'},
    {code:'provider_unavailable',message:'Market data provider unavailable'},
    {code:'provider_http_status',message:'Unexpected market data HTTP status'},
    {code:'provider_rate_limited',message:'Market data rate limited',status:429,retry_after_seconds:'18446744073709551616'},
  ])('requires code-specific safe metadata (%j)', error => {
    expect(() => decodeErrorEnvelope({error})).toThrow();
  });
});
