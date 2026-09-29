// Usage: pnpm site:build → site/ (git-ignored). The public legal pages from docs/legal/, published by
// .github/workflows/pages.yml to GitHub Pages. The app name comes from pure/brand.ts.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { APP_NAME } from '../supabase/functions/_shared/pure/brand.ts';
import { LEGAL_PAGES, renderIndex, renderLegalPage } from './site/render.ts';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'site');

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const page of LEGAL_PAGES) {
  const markdown = readFileSync(resolve(root, 'docs/legal', `${page.slug}.md`), 'utf8');
  writeFileSync(resolve(out, `${page.slug}.html`), renderLegalPage(markdown, page, APP_NAME));
}
writeFileSync(resolve(out, 'index.html'), renderIndex(APP_NAME));
// GitHub Pages serves files as they are (no Jekyll processing).
writeFileSync(resolve(out, '.nojekyll'), '');
console.log(`Built ${LEGAL_PAGES.length + 1} pages into site/`);
