import { expect, it } from 'vitest';
import { canonicalQuantity, quantityError } from '../../src/portfolio-model';

it.each(['0','0.1','2','0.00000001','1000000','1000000.00000000','0'.repeat(32),'0000001.20000000'])('accepts exact valid quantity %s',value=>{
  expect(quantityError(value)).toBeNull();
});
it.each(['','-1','+1','1e2',' 1','1 ','1\n','１','١','.1','1.','1.000000001','1000000.00000001','1000001','9'.repeat(32),'0'.repeat(33),'NaN','Infinity'])('rejects invalid quantity %j with a safe field message',value=>{
  expect(quantityError(value)).toEqual(expect.any(String));
  expect(quantityError(value)!.length).toBeGreaterThan(0);
});
it.each([['000.10000000','0.1'],['000','0'],['1000000.00000000','1000000'],['0002.00100000','2.001']])('canonicalizes validated %s text exactly for response identity', (input,output)=>{
  expect(canonicalQuantity(input)).toBe(output);
});
