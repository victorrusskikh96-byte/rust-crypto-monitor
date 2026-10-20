import type { Asset } from '../api/contracts';

type HoldingsInputProps = {
  asset: Asset;
  value: string;
  error: string | undefined;
  onChange: (asset: Asset, value: string) => void;
};

export function HoldingsInput({ asset, value, error, onChange }: HoldingsInputProps) {
  const inputId = `portfolio-${asset.toLowerCase()}`;
  return (
    <div className={`holding-input${error ? ' holding-input-invalid' : ''}`}>
      <label htmlFor={inputId}>{asset} quantity</label>
      <div className="holding-input-control">
        <span className="holding-asset-mark" aria-hidden="true">{asset === 'BTC' ? '₿' : 'Ξ'}</span>
        <input
          id={inputId}
          name={asset}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="0"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ''}`}
          onChange={event => onChange(asset, event.target.value)}
        />
        <span className="holding-input-unit" aria-hidden="true">{asset}</span>
      </div>
      <p id={`${inputId}-hint`} className="holding-input-hint">0–1,000,000 · up to 8 decimal places</p>
      {error && <p id={`${inputId}-error`} className="holding-input-error" role="alert">{error}</p>}
    </div>
  );
}
