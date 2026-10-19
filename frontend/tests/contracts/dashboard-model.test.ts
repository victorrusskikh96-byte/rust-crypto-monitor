import { describe, expect, it } from 'vitest';
import { decodeDashboard } from '../../src/api/decode';
import { elapsedMilliseconds, marketViews, nextDisplayDelay, remainingCooldown } from '../../src/dashboard-model';
import { observedDashboard } from './fixtures';

const snapshot = () => ({dashboard:decodeDashboard(observedDashboard()),requestedAt:100,receivedAt:100});
describe('monotonic display time and exact freshness boundary', () => {
  it('is fresh at60000ms and stale at60001ms without touching exact financial strings', () => {
    const state=snapshot();
    expect(marketViews(state,60100,true,false).map(view=>view.stateLabel)).toEqual(['Fresh','Fresh']);
    expect(marketViews(state,60101,true,false).every(view=>view.stateLabel.includes('Stale'))).toBe(true);
    expect(marketViews(state,60101,true,false)[0]!.market.observation!.price).toBe('65000.1200000000000000000001');
    expect(state.dashboard.markets[0]!.observation!.price).toBe('65000.1200000000000000000001');
  });
  it('counts transit conservatively and never lets wall-clock reversal extend freshness', () => {
    const state=snapshot();state.receivedAt=1100;
    expect(marketViews(state,60101,true,false)[0]!.stateLabel).toContain('Stale');
    expect(elapsedMilliseconds(100,99)).toBe(0n);
    expect(elapsedMilliseconds(100,100.01)).toBe(1n);
  });
  it('marks young observations previous when disconnected, pending or backend-stale', () => {
    const state=snapshot();
    expect(marketViews(state,100,false,false)[0]!.previous).toBe(true);
    expect(marketViews(state,100,true,true)[0]!.stateLabel).toContain('refresh in progress');
    state.dashboard.markets[0]!.state='stale';
    state.dashboard.markets[0]!.attempt_state='failed';
    state.dashboard.markets[0]!.last_error={code:'provider_timeout',message:'Market data request timed out'};
    expect(marketViews(state,100,true,false)[0]!.stateLabel).toContain('Stale');
  });
  it('uses bounded countdown timers and stops after the last transition', () => {
    const state=snapshot();
    expect(nextDisplayDelay(state,null,60100)).toBe(1);
    expect(nextDisplayDelay(state,null,60101)).toBeNull();
    expect(nextDisplayDelay(null,{milliseconds:'340282366920938463463374607431768211455',receivedAt:0},0)).toBe(1000);
    expect(remainingCooldown('1000',100,1100)).toBe(0n);
    expect(remainingCooldown('1000',100,1101)).toBe(0n);
    expect(nextDisplayDelay(null,null,0)).toBeNull();
  });
});
