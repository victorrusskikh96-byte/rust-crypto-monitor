import type { MarketView } from '../dashboard-model';
import { MarketCard } from './MarketCard';

type MarketOverviewProps = { markets: readonly MarketView[]; pending: boolean };

export function MarketOverview({ markets, pending }: MarketOverviewProps) {
  return (
    <section className="market-overview" aria-labelledby="market-overview-title" aria-busy={pending}>
      <div className="section-heading market-section-heading">
        <div>
          <p className="eyebrow">OBSERVED MARKET DATA</p>
          <h2 id="market-overview-title">Market Overview</h2>
        </div>
        <span className="section-note">Two markets · USDT quotes</span>
      </div>
      <div className="market-grid">
        {markets.map(view => <MarketCard key={view.market.pair} view={view} />)}
      </div>
      <p className="market-footnote">Prices are preserved exactly as received. Freshness describes observation age, not a guarantee of the current trading price.</p>
    </section>
  );
}
