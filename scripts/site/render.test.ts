import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_NAME } from '../../supabase/functions/_shared/pure/brand.ts';
import { DRAFT_NOTICE, LEGAL_PAGES, renderIndex, renderLegalPage } from './render.ts';

const legalDir = resolve(import.meta.dirname, '../../docs/legal');
const privacy = { slug: 'gizlilik-politikasi', title: 'Gizlilik Politikası' };

describe('legal site', () => {
  it('renders every page from docs/legal with the app name and the draft notice', () => {
    for (const page of LEGAL_PAGES) {
      const markdown = readFileSync(resolve(legalDir, `${page.slug}.md`), 'utf8');
      const html = renderLegalPage(markdown, page, APP_NAME);
      expect(html).toContain(DRAFT_NOTICE);
      expect(html).toContain(`<title>${page.title} · ${APP_NAME}</title>`);
      expect(html).not.toContain('{{APP_NAME}}');
    }
  });

  it('keeps the drafts marked for legal review', () => {
    for (const page of LEGAL_PAGES) {
      const markdown = readFileSync(resolve(legalDir, `${page.slug}.md`), 'utf8');
      expect(markdown).toContain('HUKUKİ KONTROL GEREKLİ');
    }
  });

  it('fills the placeholder with the given name', () => {
    const html = renderLegalPage('**{{APP_NAME}}** hesabı', privacy, 'Deneme');
    expect(html).toContain('<strong>Deneme</strong> hesabı');
  });

  it('wraps tables so they scroll on a phone', () => {
    const html = renderLegalPage('| a | b |\n| - | - |\n| 1 | 2 |', privacy, 'X');
    expect(html).toContain('<div class="table"><table>');
  });

  it('links every page from the index', () => {
    const html = renderIndex(APP_NAME);
    for (const page of LEGAL_PAGES) expect(html).toContain(`href="${page.slug}.html"`);
  });
});
