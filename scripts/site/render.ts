// The public legal pages (GitHub Pages): each docs/legal/*.md becomes one HTML page. Pure, so the
// placeholder and the draft banner are tested; scripts/build-site.ts does the file work.
import { marked } from 'marked';

export type LegalPage = { slug: string; title: string };

// Order of the index page. The slug is the file name under docs/legal/ without ".md".
export const LEGAL_PAGES: LegalPage[] = [
  { slug: 'gizlilik-politikasi', title: 'Gizlilik Politikası' },
  { slug: 'kvkk-aydinlatma-metni', title: 'KVKK Aydınlatma Metni' },
  { slug: 'kullanim-kosullari', title: 'Kullanım Koşulları' },
  { slug: 'hesap-silme', title: 'Hesap Silme Talebi' },
];

// Shown on every page until the texts pass legal review.
export const DRAFT_NOTICE = 'Taslak, hukuki kontrol bekliyor.';

const PLACEHOLDER = /\{\{APP_NAME\}\}/g;

export function fillAppName(text: string, appName: string): string {
  return text.replace(PLACEHOLDER, appName);
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const STYLE = `
:root { color-scheme: light dark; --bg: #fff; --fg: #111; --muted: #555; --line: #ddd; --note: #fff4d6; --note-fg: #5a4300; }
@media (prefers-color-scheme: dark) { :root { --bg: #111; --fg: #eee; --muted: #aaa; --line: #333; --note: #3a3000; --note-fg: #ffe9a8; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 24px 16px 64px; }
header { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; flex-wrap: wrap; }
header a { color: inherit; font-weight: 700; text-decoration: none; }
nav a { color: var(--muted); margin-right: 12px; font-size: 14px; }
.draft { background: var(--note); color: var(--note-fg); padding: 12px 16px; border-radius: 8px; font-weight: 600; margin: 16px 0; }
.table { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { border: 1px solid var(--line); padding: 6px 8px; text-align: left; vertical-align: top; }
blockquote { margin: 0; padding: 0 16px; border-left: 4px solid var(--line); color: var(--muted); }
a { color: #2563eb; }
footer { margin-top: 48px; color: var(--muted); font-size: 14px; }
`;

function layout(appName: string, title: string, body: string): string {
  const nav = LEGAL_PAGES.map((p) => `<a href="${p.slug}.html">${escapeHtml(p.title)}</a>`).join(
    '',
  );
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(`${title} · ${appName}`)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<header><a href="index.html">${escapeHtml(appName)}</a><nav>${nav}</nav></header>
<p class="draft">${escapeHtml(DRAFT_NOTICE)}</p>
${body}
<footer>${escapeHtml(appName)}</footer>
</main>
</body>
</html>
`;
}

export function renderLegalPage(markdown: string, page: LegalPage, appName: string): string {
  const html = marked.parse(fillAppName(markdown, appName), { async: false, gfm: true });
  // Wide tables scroll inside their box instead of the page on a phone.
  const body = html
    .replaceAll('<table>', '<div class="table"><table>')
    .replaceAll('</table>', '</table></div>');
  return layout(appName, page.title, body);
}

export function renderIndex(appName: string): string {
  const items = LEGAL_PAGES.map(
    (p) => `<li><a href="${p.slug}.html">${escapeHtml(p.title)}</a></li>`,
  ).join('\n');
  return layout(appName, 'Yasal metinler', `<h1>Yasal metinler</h1>\n<ul>\n${items}\n</ul>`);
}
