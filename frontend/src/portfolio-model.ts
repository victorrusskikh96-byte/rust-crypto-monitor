import type { Quantities, QuantityErrors } from './api/contracts';

// UX validation only. The Rust endpoint validates the original text authoritatively.
export function quantityError(input: string): string | null {
  if (input === '') return 'Enter a quantity; use 0 for no holdings.';
  if (input.length > 32) return 'Use at most 32 ASCII characters.';
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(input)) return 'Use unsigned decimal digits without spaces, signs or exponents.';
  const [integer = '', fraction = ''] = input.split('.');
  if (fraction.length > 8) return 'Use at most eight fractional digits.';
  // Syntax/length are bounded before any integer conversion. No financial floats.
  if (BigInt(integer) > 1000000n || (BigInt(integer) === 1000000n && /[1-9]/.test(fraction))) {
    return 'Quantity must be between 0 and 1000000 inclusive.';
  }
  return null;
}

export function canonicalQuantity(input: string): string {
  if (quantityError(input) !== null) throw new Error('Invalid quantity');
  const [integer = '', fraction = ''] = input.split('.');
  const whole = integer.replace(/^0+(?=[0-9])/, '');
  const tail = fraction.replace(/0+$/, '');
  return tail === '' ? whole : whole + '.' + tail;
}

export function quantityErrors(quantities: Quantities): QuantityErrors {
  const errors: QuantityErrors = {};
  for (const asset of ['BTC', 'ETH'] as const) {
    const error = quantityError(quantities[asset]);
    if (error !== null) errors[asset] = error;
  }
  return errors;
}
