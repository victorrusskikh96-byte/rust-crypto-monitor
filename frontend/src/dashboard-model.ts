import type { Dashboard, Market } from './api/contracts';

export interface MarketView {
  market: Market;
  stateLabel: string;
  ageLabel: string;
  previous: boolean;
}
export interface TimedDashboard {
  dashboard: Dashboard;
  requestedAt: number;
  receivedAt: number;
}

// Only time metadata uses numeric browser-clock arithmetic. Prices remain strings.
export function elapsedMilliseconds(start: number, now: number): bigint {
  return BigInt(Math.max(0, Math.ceil(now - start)));
}
export function remainingCooldown(milliseconds: string, receivedAt: number, now: number): bigint {
  const remaining = BigInt(milliseconds) - BigInt(Math.max(0, Math.floor(now - receivedAt)));
  return remaining > 0n ? remaining : 0n;
}
export function marketViews(snapshot: TimedDashboard, now: number, current: boolean, pending: boolean): readonly MarketView[] {
  return snapshot.dashboard.markets.map(market => {
    const age = market.observation_age_ms === null ? null :
      BigInt(market.observation_age_ms) + elapsedMilliseconds(snapshot.requestedAt, now);
    const fresh = current && !pending && market.state === 'success' && market.attempt_state === 'success' &&
      market.last_error === null && age !== null && age <= 60000n;
    const previous = market.observation !== null && !fresh;
    return {
      market, previous,
      stateLabel: market.observation === null
        ? (pending || market.state === 'loading' ? 'Refresh in progress · unavailable' : 'Unavailable')
        : fresh ? 'Fresh' : pending || market.state === 'loading'
          ? 'Stale · refresh in progress' : 'Stale · previously observed',
      ageLabel: age === null ? 'No observation yet'
        : 'Estimated receipt age at last display update: ' + age.toString() + ' ms',
    };
  });
}

// A single local display timer, no I/O. Stop once all quotes are stale and cooldown is zero.
export function nextDisplayDelay(snapshot: TimedDashboard | null, cooldown: { milliseconds: string; receivedAt: number } | null, now: number): number | null {
  let delay: bigint | null = cooldown && remainingCooldown(cooldown.milliseconds, cooldown.receivedAt, now) > 0n ? 1000n : null;
  if (snapshot) {
    for (const market of snapshot.dashboard.markets) {
      if (market.state !== 'success' || market.observation_age_ms === null) continue;
      const remaining = 60001n - BigInt(market.observation_age_ms) - elapsedMilliseconds(snapshot.requestedAt, now);
      if (remaining > 0n && (delay === null || remaining < delay)) delay = remaining;
    }
  }
  // Conversion is bounded to a timer delay <=1000ms, never monetary data.
  return delay === null ? null : Number(delay > 1000n ? 1000n : delay);
}
