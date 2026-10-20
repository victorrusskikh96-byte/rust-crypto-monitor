import type { Valuation } from '../api/contracts';
import { AssetValuationRow } from './AssetValuationRow';

type PortfolioSummaryProps = { result: Valuation; outdated: boolean };

export function PortfolioSummary({ result, outdated }: PortfolioSummaryProps) {
  return (
    <div className={`portfolio-summary${outdated ? ' portfolio-summary-outdated' : ''}`}>
      <div className="portfolio-total-heading">
        <h3>Estimated portfolio value</h3>
        <span className={`portfolio-state${outdated || result.state === 'incomplete' ? ' portfolio-state-warning' : ''}`}>
          {outdated ? 'Outdated estimate' : result.state === 'complete' ? 'Complete estimate' : 'Incomplete estimate'}
        </span>
      </div>
      {outdated && <p className="portfolio-outdated" role="status">Outdated result — historical values only. Confirm the market state and calculate again to obtain a current estimate.</p>}
      <p className={`portfolio-total${result.total === null ? ' portfolio-total-unavailable' : ''}`}>
        <span className="portfolio-total-value">{result.total ?? 'Unavailable'}</span>
        {result.total !== null && <span className="valuation-unit">USDT</span>}
      </p>
      {result.state === 'incomplete' && <p className="portfolio-completeness">Valuation incomplete. A positive holding has no usable quote; the portfolio total and allocations are unavailable.</p>}
      {result.total === '0' && <p className="portfolio-completeness">Total is 0. Allocations are unavailable for a zero-value portfolio.</p>}
      <div className="asset-valuations">
        {result.holdings.map(holding => <AssetValuationRow key={holding.asset} holding={holding} />)}
      </div>
      <p className="portfolio-result-note">Estimated from the selected market snapshot. Allocations are rounded independently to two decimal places.</p>
    </div>
  );
}
