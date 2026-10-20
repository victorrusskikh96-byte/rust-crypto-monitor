// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css=readFileSync(new URL('../../src/styles.css',import.meta.url),'utf8');

function declarations(selector:string):string {
  const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(match,`missing CSS rule for ${selector}`).not.toBeNull();
  return match![1]!;
}

function pixels(selector:string,property:string):number {
  const match=declarations(selector).match(new RegExp(`${property}\\s*:\\s*([0-9.]+)px`));
  expect(match,`missing pixel ${property} for ${selector}`).not.toBeNull();
  return Number(match![1]);
}

function hex(selector:string,property:string):string {
  const match=declarations(selector).match(new RegExp(`${property}\\s*:[^;]*(#[0-9a-fA-F]{6})`));
  expect(match,`missing hex ${property} for ${selector}`).not.toBeNull();
  return match![1]!;
}

function luminance(value:string):number {
  const channels=[1,3,5].map(offset=>Number.parseInt(value.slice(offset,offset+2),16)/255)
    .map(channel=>channel<=.04045 ? channel/12.92 : ((channel+.055)/1.055)**2.4);
  return .2126*channels[0]!+.7152*channels[1]!+.0722*channels[2]!;
}

function contrast(left:string,right:string):number {
  const [lighter,darker]=[luminance(left),luminance(right)].sort((a,b)=>b-a);
  return (lighter!+.05)/(darker!+.05);
}

it('uses a readable baseline for important portfolio supporting text',()=>{
  for(const selector of [
    '.holding-input-unit',
    '.holding-input-hint',
    '.portfolio-privacy',
    '.portfolio-state',
    '.valuation-unit',
    '.asset-valuation-heading h4 span',
    '.asset-valuation-details dt',
    '.holding-incomplete-reason',
    '.portfolio-result-note',
    '.portfolio-footnote',
  ]) expect(pixels(selector,'font-size'),selector).toBeGreaterThanOrEqual(12);
});

it('strengthens the resting quantity boundary while retaining its focus treatment',()=>{
  const border=hex('.holding-input-control','border');
  expect(contrast(border,'#121a15')).toBeGreaterThanOrEqual(3);
  expect(contrast(border,'#191e1b')).toBeGreaterThanOrEqual(3);
  const focus=declarations('.holding-input-control:focus-within');
  expect(focus).toMatch(/border-color\s*:/);
  expect(focus).toMatch(/outline\s*:\s*2px\s+solid/);
  expect(focus).toMatch(/outline-offset\s*:/);
});

it('keeps primary refresh, reconciliation, calculate and cancel targets at least 44px tall',()=>{
  expect(pixels('.refresh-actions button','min-height')).toBeGreaterThanOrEqual(44);
  expect(pixels('.portfolio-actions button','min-height')).toBeGreaterThanOrEqual(44);
});

it('preserves the established responsive breakpoints and exact-value wrapping',()=>{
  for(const width of [1200,900,767,700,380]) expect(css).toContain(`@media (${width===1200?'min':'max'}-width: ${width}px)`);
  for(const selector of ['.price-value','.portfolio-total-value','.asset-valuation-details dd']) {
    expect(declarations(selector)).toMatch(/overflow-wrap\s*:\s*anywhere/);
  }
  expect(css).not.toMatch(/text-overflow\s*:\s*ellipsis/);
});
