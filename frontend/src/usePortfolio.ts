import { useEffect, useRef, useState } from 'react';
import { ApiClientError, calculatePortfolio } from './api/client';
import type { Asset, Quantities, QuantityErrors, Valuation } from './api/contracts';
import { elapsedMilliseconds, type TimedDashboard } from './dashboard-model';
import { canonicalQuantity, quantityErrors } from './portfolio-model';

const completeMessage = 'Calculation complete. Values are estimates in USDT.';
const incompleteMessage = 'Calculation incomplete. Some positive holdings lack usable market quotes.';

function freshness(snapshot: TimedDashboard | null, now: number): string {
  return snapshot?.dashboard.markets.map(market => market.state === 'success' &&
    market.observation_age_ms !== null &&
    BigInt(market.observation_age_ms) + elapsedMilliseconds(snapshot.requestedAt, now) <= 60000n
    ? 'fresh' : 'unavailable').join(':') ?? 'unconfirmed';
}

interface Context {
  snapshot: TimedDashboard | null;
  enabled: boolean;
  visible: boolean;
  freshness: string;
}
interface Accepted {
  data: Valuation;
  token: object;
  snapshot: TimedDashboard;
  freshness: string;
}

export function usePortfolio(snapshot: TimedDashboard | null, enabled: boolean, now: number,
  visible: boolean, onUnconfirmed: (disconnected: boolean) => void) {
  const [quantities, setQuantities] = useState<Quantities>({ BTC: '', ETH: '' });
  const [errors, setErrors] = useState<QuantityErrors>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<Accepted | null>(null);
  const alive = useRef(false);
  // Object identity is a bounded generation token: no ever-growing counters.
  const generation = useRef<object>({});
  const controller = useRef<AbortController | null>(null);
  const active = useRef(false);
  const current: Context = { snapshot, enabled, visible, freshness: freshness(snapshot, now) };
  const context = useRef(current);
  context.current = current;

  function invalidate() {
    generation.current = {};
    controller.current?.abort();
    controller.current = null;
    active.current = false;
    setBusy(false);
  }

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current = {};
      controller.current?.abort();
      active.current = false;
    };
  }, []);

  useEffect(() => {
    invalidate();
  }, [snapshot, enabled, visible, current.freshness]);

  function onChange(asset: Asset, value: string) {
    invalidate();
    setQuantities(previous => ({ ...previous, [asset]: value }));
    setErrors(previous => {
      const next = { ...previous };
      delete next[asset];
      return next;
    });
    setMessage(null);
  }

  function onCancel() {
    invalidate();
    setMessage('Calculation canceled. Choose Calculate portfolio to try again.');
  }

  async function calculate() {
    if (!alive.current || active.current) return;
    const invalid = quantityErrors(quantities);
    setErrors(invalid);
    if (Object.keys(invalid).length > 0) {
      setMessage('Check the highlighted quantity fields.');
      return;
    }
    const captured = context.current;
    const capturedSnapshot = captured.snapshot;
    if (!capturedSnapshot || !captured.enabled || !captured.visible) {
      setMessage('Read backend state or finish the market refresh before calculating.');
      return;
    }
    const inputs = { ...quantities };
    const token = {};
    generation.current = token;
    const abortController = new AbortController();
    controller.current = abortController;
    active.current = true;
    setBusy(true);
    setMessage(null);
    const isCurrent = () => alive.current && generation.current === token &&
      !abortController.signal.aborted && context.current.snapshot === capturedSnapshot &&
      context.current.enabled && context.current.visible && context.current.freshness === captured.freshness &&
      freshness(capturedSnapshot, performance.now()) === captured.freshness;
    try {
      const result = await calculatePortfolio(capturedSnapshot.dashboard.snapshot_id, inputs, abortController.signal);
      if (!isCurrent()) return;
      const dashboard = capturedSnapshot.dashboard;
      if (result.snapshot_id !== dashboard.snapshot_id || result.holdings.some(holding =>
        holding.quantity !== canonicalQuantity(inputs[holding.asset])) ||
        (dashboard.mode === 'fixture' ? result.mode !== 'fixture' ||
          result.fixture.scenario !== dashboard.fixture.scenario : result.mode !== undefined)) {
        throw new ApiClientError('invalid_response');
      }
      setAccepted({ data: result, token, snapshot: capturedSnapshot, freshness: captured.freshness });
      setMessage(result.state === 'complete' ? completeMessage : incompleteMessage);
    } catch (error) {
      if (!isCurrent()) return;
      const failure = error instanceof ApiClientError ? error : new ApiClientError('disconnected');
      if (failure.kind === 'aborted') return;
      if (failure.kind === 'http_error') {
        const safe = failure.safeError;
        if (safe?.field) {
          const asset = safe.field === 'quantities.BTC' ? 'BTC' : 'ETH';
          setErrors({ [asset]: safe.message });
        }
        if (failure.status === 409) {
          onUnconfirmed(false);
          setMessage('Market state may have changed: ' + (safe?.message ?? 'Calculation conflict') +
            '. Use Read backend state, then explicitly Calculate portfolio again.');
        } else if (failure.status === 503) {
          onUnconfirmed(false);
          setMessage('Backend unavailable: ' + (safe?.message ?? 'Service is busy') + '. Use Read backend state.');
        } else setMessage(safe?.message ?? 'The API rejected the calculation.');
      } else if (failure.kind === 'timeout') {
        setMessage('Calculation deadline expired. Choose Calculate portfolio to try again.');
      } else if (failure.kind === 'invalid_response') {
        setMessage('Valuation response invalid or unsupported. No new values were accepted.');
      } else {
        onUnconfirmed(true);
        setMessage('API disconnected. Check the local servers and use Read backend state.');
      }
    } finally {
      if (alive.current && generation.current === token) {
        controller.current = null;
        active.current = false;
        setBusy(false);
      }
    }
  }

  const outdated = accepted !== null && (accepted.token !== generation.current ||
    accepted.snapshot !== snapshot || accepted.freshness !== current.freshness || !enabled || !visible);
  return {
    quantities, errors, busy,
    message: outdated && (message === completeMessage || message === incompleteMessage)
      ? 'Previous calculation is outdated. Confirm market state and calculate again.' : message,
    available: enabled && visible,
    result: accepted?.data ?? null,
    outdated,
    onChange, onCalculate: () => { void calculate(); }, onCancel, invalidate,
  };
}
