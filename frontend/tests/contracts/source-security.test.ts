// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { expect, it } from 'vitest';

function sources(directory:string):Array<{path:string;text:string}> {
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const path=join(directory,entry.name);
    return entry.isDirectory() ? (entry.name==='test' ? [] : sources(path)) : /\.(ts|tsx)$/.test(entry.name) ? [{path,text:readFileSync(path,'utf8')}] : [];
  });
}
it('keeps exact financial strings, fixed endpoints and explicit-only provider refresh',()=>{
  const files=sources(fileURLToPath(new URL('../../src/',import.meta.url)));
  const source=files.map(file=>file.text).join('\n');
  const financial=files.filter(file=>!file.path.endsWith('dashboard-model.ts')).map(file=>file.text).join('\n');
  expect(financial).not.toMatch(/\b(?:Number|parseFloat|parseInt)\s*\(/);
  expect(financial).not.toMatch(/Math\.(?:round|floor|ceil|trunc)|\.toFixed\s*\(/);
  expect(source).not.toMatch(/https?:\/\//);
  expect(source).not.toMatch(/setInterval\s*\(|localStorage|sessionStorage|WebSocket\s*\(/);
  expect(source).not.toMatch(/dangerouslySetInnerHTML/);
  const client=files.find(file=>file.path.endsWith(join('api','client.ts')))!.text;
  expect(client).toContain("'/api/v1/dashboard'");
  expect(client).toContain("'/api/v1/refresh'");
  expect(client).toContain("credentials: 'omit'");
  expect(client).not.toMatch(/Origin\s*:/);
  for(const file of files.filter(file=>!file.path.endsWith(join('api','client.ts')))) expect(file.text).not.toMatch(/\bfetch\s*\(/);
});
it('uses semantic accessible responsive structure and CSS-only assets at narrow and wide targets',()=>{
  const root=new URL('../../src/',import.meta.url);
  const css=readFileSync(new URL('styles.css',root),'utf8');
  expect(css).toMatch(/:focus-visible/);
  expect(css).toMatch(/overflow-wrap:\s*anywhere/);
  expect(css).toMatch(/min-width:\s*0/);
  expect(css).toMatch(/@media/);
  expect(css).not.toMatch(/https?:|@import|url\s*\(/);
  const card=readFileSync(new URL('components/MarketCard.tsx',root),'utf8');
  expect(card).toContain('<article');
  expect(card).toContain('aria-labelledby');
  expect(card).toContain('<dl');
  const refresh=readFileSync(new URL('components/RefreshControl.tsx',root),'utf8');
  expect(refresh).toContain('aria-label="Refresh markets"');
  expect(refresh).toContain('role="status"');
  expect(refresh).not.toContain('aria-live="assertive"');
});
