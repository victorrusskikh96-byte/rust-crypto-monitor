import type { HoldingValuation } from '../api/contracts';

type AssetValuationRowProps = { holding: HoldingValuation };

export function AssetValuationRow({ holding }: AssetValuationRowProps) {
  const reason = holding.reason === 'quote_missing'
    ? 'Quote missing (quote_missing). No usable market observation is available.'
    : holding.reason === 'quote_stale'
      ? 'Quote stale (quote_stale). The observation is old or no longer confirmed usable for this calculation.'
      : null;
  return (
    <div className={`asset-valuation-row${reason ? ' asset-valuation-incomplete' : ''}`}>
      <div className="asset-valuation-heading">
        <div>
          <h4>{holding.asset === 'BTC' ? 'Bitcoin' : 'Ethereum'} <span>{holding.asset}</span></h4>
          <p className="holding-exact-quantity">{holding.quantity} {holding.asset}</p>
        </div>
        {reason && <span className="portfolio-state portfolio-state-warning">Incomplete</span>}
      </div>
      <dl className="asset-valuation-details">
        <div>
          <dt>{holding.reason === 'quote_stale' ? 'Stale observed price' : 'Price'}</dt>
          <dd>{holding.price === null ? 'Unavailable' : <><span>{holding.price}</span> <span className="valuation-unit">USDT</span></>}</dd>
        </div>
        <div>
          <dt>Holding value</dt>
          <dd>{holding.value === null ? 'Unavailable' : <><span>{holding.value}</span> <span className="valuation-unit">USDT</span></>}</dd>
        </div>
        <div>
          <dt>Allocation</dt>
          <dd>{holding.allocation_pct === null ? 'Unavailable' : `${holding.allocation_pct}%`}</dd>
        </div>
      </dl>
      {reason && <p className="holding-incomplete-reason">{reason}</p>}
    </div>
  );
}
