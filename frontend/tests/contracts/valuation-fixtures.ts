import type { Valuation } from '../../src/api/contracts';
import { fixtureNotice } from './fixtures';

export function valuation(): Valuation {
  return {
    snapshot_id: 'opaque-token-0', quote: 'USDT', state: 'complete',
    holdings: [
      {asset:'BTC',quantity:'0.1',price:'65000.12',value:'6500.012',allocation_pct:'56.52',reason:null},
      {asset:'ETH',quantity:'2',price:'2500.00000001',value:'5000.00000002',allocation_pct:'43.48',reason:null},
    ],
    total:'11500.01200002', allocation_rounding:'independent_half_even_2dp',estimate:true,
    mode:'fixture',provenance:'fixture',fixture:{scenario:'success',notice:fixtureNotice},
  };
}

export function incompleteValuation(reason:'quote_missing'|'quote_stale',both=false): Valuation {
  const value=valuation();
  value.state='incomplete';value.total=null;
  value.holdings=value.holdings.map((holding,index)=>({
    ...holding,allocation_pct:null,
    ...(index===1 || both ? {price:reason==='quote_missing' ? null : holding.price,value:null,reason} : {}),
  }));
  return value;
}

export function zeroValuation(): Valuation {
  const value=valuation();value.total='0';
  value.holdings=value.holdings.map(holding=>({...holding,quantity:'0',price:null,value:'0',allocation_pct:null}));
  return value;
}
