// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { expect, it } from 'vitest';

function sources(directory: string): string[] {
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry => {
    const path = join(directory,entry.name);
    return entry.isDirectory() ? (entry.name === 'test' ? [] : sources(path)) : /\.(ts|tsx)$/.test(entry.name) ? [readFileSync(path,'utf8')] : [];
  });
}
it('keeps financial values as strings without conversion, rounding or hidden provider requests', () => {
  const source = sources(fileURLToPath(new URL('../../src/',import.meta.url))).join('\n');
  expect(source).not.toMatch(/\b(?:Number|parseFloat|parseInt)\s*\(/);
  expect(source).not.toMatch(/Math\.(?:round|floor|ceil|trunc)|\.toFixed\s*\(/);
  expect(source).not.toMatch(/https?:\/\//);
  expect(source).not.toMatch(/setInterval\s*\(|setTimeout\s*\(/);
});
