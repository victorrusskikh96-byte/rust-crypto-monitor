import type { Asset, Quantities, QuantityErrors, Valuation } from '../api/contracts';
import { HoldingsInput } from './HoldingsInput';
import { PortfolioSummary } from './PortfolioSummary';

type PortfolioCalculatorProps = {
  quantities: Quantities;
  errors: QuantityErrors;
  busy: boolean;
  available: boolean;
  message: string | null;
  result: Valuation | null;
  outdated: boolean;
  fixture: boolean;
  onChange: (asset: Asset, value: string) => void;
  onCalculate: () => void;
  onCancel: () => void;
};

export function PortfolioCalculator({ quantities, errors, busy, available, message, result, outdated, fixture, onChange, onCalculate, onCancel }: PortfolioCalculatorProps) {
  const synthetic = fixture || result?.mode === 'fixture';
  return (
    <section className="portfolio-section panel" aria-labelledby="portfolio-title">
      <div className="section-heading portfolio-section-heading">
        <div>
          <p className="eyebrow">YOUR HOLDINGS · EXACT ESTIMATES</p>
          <h2 id="portfolio-title">Portfolio</h2>
        </div>
        <span className="mode-badge">BTC + ETH / USDT</span>
      </div>
      <p className="portfolio-description">Enter your holdings to estimate their value from the latest confirmed market data.</p>
      {synthetic && <p className="synthetic-label portfolio-fixture-label">Synthetic fixture data · demonstration estimates</p>}
      <div className="portfolio-layout">
        <form className="portfolio-form" noValidate onSubmit={event => { event.preventDefault(); if (!busy && available) onCalculate(); }}>
          <fieldset>
            <legend>Holdings</legend>
            <HoldingsInput asset="BTC" value={quantities.BTC} error={errors.BTC} onChange={onChange} />
            <HoldingsInput asset="ETH" value={quantities.ETH} error={errors.ETH} onChange={onChange} />
          </fieldset>
          <div className="portfolio-actions">
            <button className="calculate-button" type="submit" disabled={busy || !available} aria-label="Calculate portfolio">{busy ? 'Calculating…' : 'Calculate portfolio'}</button>
            {busy && <button className="cancel-calculation" type="button" onClick={onCancel}>Cancel calculation</button>}
          </div>
          <div className="portfolio-feedback" role="status" aria-live="polite" aria-atomic="true">
            {busy && <p>Calculating your portfolio…</p>}
            {message && <p>{message}</p>}
            {!available && !message && <p>Confirm an available market snapshot before calculating. Wait for any active market refresh to finish.</p>}
          </div>
          <p className="portfolio-privacy">Holdings stay in memory and are sent only to the local calculator. Calculate again after changing inputs or market data.</p>
        </form>
        <div className="portfolio-result" aria-busy={busy}>
          {result ? <PortfolioSummary result={result} outdated={outdated} /> : <div className="portfolio-empty">
            <span className="portfolio-empty-mark" aria-hidden="true">=</span>
            <h3>Your portfolio, precisely valued</h3>
            <p>Enter BTC and ETH quantities, then choose Calculate portfolio. Exact values and allocations will appear here.</p>
            <span className="portfolio-state">Awaiting calculation</span>
          </div>}
        </div>
      </div>
      <p className="portfolio-footnote">Read-only estimate · no trading or wallet connection · no automatic calculation</p>
    </section>
  );
}
