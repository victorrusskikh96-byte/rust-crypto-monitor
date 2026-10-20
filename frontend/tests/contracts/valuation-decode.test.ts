import { expect, it } from 'vitest';
import { decodeValuation } from '../../src/api/decode';
import { incompleteValuation, valuation, zeroValuation } from './valuation-fixtures';

it.each([valuation(),incompleteValuation('quote_missing'),incompleteValuation('quote_stale',true),incompleteValuation('quote_missing',true),zeroValuation()])('accepts exact Rust valuation semantics %#',value=>{
  expect(decodeValuation(value)).toEqual(value);
});
it('accepts real responses without fixture-only annotation',()=>{
  const {mode:_mode,provenance:_provenance,fixture:_fixture,...value}=valuation() as ReturnType<typeof valuation> & {provenance:string;fixture:unknown};
  expect(decodeValuation(value)).toEqual(value);
});
it('requires every top-level and holding field',()=>{
  for(const key of Object.keys(valuation())) {
    const value:Record<string,unknown>={...valuation()};delete value[key];
    expect(()=>decodeValuation(value),key).toThrow();
  }
  for(const key of Object.keys(valuation().holdings[0]!)) {
    const value=valuation();const holding:Record<string,unknown>={...value.holdings[0]};delete holding[key];
    expect(()=>decodeValuation({...value,holdings:[holding,value.holdings[1]]}),key).toThrow();
  }
});
it.each([
  ['snapshot_id',null],['quote','USD'],['state','ready'],['total',11500.01200002],
  ['total','1e3'],['total','-1'],['total','01'],['total','1.00'],
  ['total','79228162514264337593543950336'],['total','0.00000000000000000000000000001'],
  ['allocation_rounding','round'],['estimate',false],['unexpected','untrusted'],
  ['mode','real'],['provenance','real'],['fixture',{scenario:'unknown',notice:'unsafe'}],
])('rejects malformed or unsupported valuation %s=%j',(key,value)=>{
  expect(()=>decodeValuation({...valuation(),[key]:value})).toThrow();
});
it.each([
  ['asset','SOL'],['quantity','0.100'],['quantity','1000001'],['quantity','0.000000001'],
  ['quantity',0.1],['price','0'],['price','65000.120'],['value',6500.012],
  ['allocation_pct','56.520'],['allocation_pct','100.01'],['allocation_pct','-1.00'],
  ['reason','offline'],['raw','unsafe'],
])('rejects invalid holding %s=%j',(key,value)=>{
  const result=valuation();
  expect(()=>decodeValuation({...result,holdings:[{...result.holdings[0],[key]:value},result.holdings[1]]})).toThrow();
});
it('rejects missing, duplicate, extra and reordered assets',()=>{
  const result=valuation();const [btc,eth]=result.holdings;
  for(const holdings of [[],[btc],[btc,btc],[btc,eth,btc],[eth,btc]]) expect(()=>decodeValuation({...result,holdings})).toThrow();
});
it('rejects contradictory complete, incomplete and zero-total states without recomputing money',()=>{
  const result=valuation();
  for(const value of [
    {...result,total:null},
    {...result,state:'incomplete'},
    {...incompleteValuation('quote_missing'),total:'6500.012'},
    {...incompleteValuation('quote_missing'),holdings:result.holdings},
    {...zeroValuation(),holdings:result.holdings},
    {...result,holdings:[{...result.holdings[0],reason:'quote_missing'},result.holdings[1]]},
    {...result,holdings:[{...result.holdings[0],value:null},result.holdings[1]]},
  ]) expect(()=>decodeValuation(value)).toThrow();
});
it('accepts zero holdings with retained stale prices and mixed positive/zero allocation semantics',()=>{
  const zero=zeroValuation();zero.holdings=zero.holdings.map(holding=>({...holding,price:'1'}));
  expect(decodeValuation(zero)).toEqual(zero);
  const mixed=valuation();mixed.total='6500.012';
  mixed.holdings=[{...mixed.holdings[0]!,allocation_pct:'100.00'},{...mixed.holdings[1]!,quantity:'0',value:'0',allocation_pct:'0.00',price:null}];
  expect(decodeValuation(mixed)).toEqual(mixed);
  expect(()=>decodeValuation({...mixed,holdings:[mixed.holdings[0],{...mixed.holdings[1],allocation_pct:'1.00'}]})).toThrow();
});
