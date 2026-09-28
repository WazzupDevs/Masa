// Builds index.html for the e2e-screenshots branch: every P0 screenshot, one row per screen, the
// three design directions side by side (light and dark each). No phone frame.
// Usage: node --experimental-strip-types scripts/e2e/compare-page.ts <site dir>
// The site dir holds one folder per run, `<theme>-<scheme>` (night-light, calm-dark, …).
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const THEMES = [
  ['night', 'Gece Kafe'],
  ['play', 'Oyun Gecesi'],
  ['calm', 'Sakin Liman'],
] as const;
const SCHEMES = [
  ['light', 'Açık'],
  ['dark', 'Koyu'],
] as const;

const site = process.argv[2];
if (!site) throw new Error('usage: compare-page.ts <site dir>');

function pngs(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out = out.concat(pngs(path));
    else if (name.endsWith('.png')) out.push(path);
  }
  return out;
}

// screen name → run → image path relative to the site
const screens = new Map<string, Map<string, string>>();
for (const [theme] of THEMES) {
  for (const [scheme] of SCHEMES) {
    const run = `${theme}-${scheme}`;
    for (const file of pngs(join(site, run))) {
      const screen = basename(file, '.png');
      if (!screens.has(screen)) screens.set(screen, new Map());
      screens.get(screen)?.set(run, relative(site, file));
    }
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const rows = [...screens.keys()]
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  .map((screen) => {
    const cells = THEMES.map(([theme, themeName]) => {
      const shots = SCHEMES.map(([scheme, schemeName]) => {
        const path = screens.get(screen)?.get(`${theme}-${scheme}`);
        return path
          ? `<figure><img loading="lazy" src="${esc(path)}" alt="${esc(`${screen}, ${themeName}, ${schemeName}`)}"><figcaption>${schemeName}</figcaption></figure>`
          : `<figure class="missing"><div>—</div><figcaption>${schemeName}</figcaption></figure>`;
      }).join('');
      return `<div class="theme"><h3>${themeName}</h3><div class="pair">${shots}</div></div>`;
    }).join('');
    return `<section id="${esc(screen)}"><h2>${esc(screen)}</h2><div class="themes">${cells}</div></section>`;
  })
  .join('\n');

const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Masa tema karşılaştırması</title>
<style>
  :root { color-scheme: light dark; --bg: #f4f4f2; --fg: #1c1c1a; --muted: #5d5d58; --line: #d6d6d0; }
  @media (prefers-color-scheme: dark) { :root { --bg: #151514; --fg: #f1f1ec; --muted: #b3b3ab; --line: #34342f; } }
  body { margin: 0; padding: 24px 16px 48px; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
  h1 { margin: 0 0 4px; font-size: 26px; }
  p.lede { margin: 0 0 24px; color: var(--muted); }
  section { margin: 0 0 40px; padding-top: 16px; border-top: 1px solid var(--line); }
  h2 { margin: 0 0 12px; font-size: 17px; font-family: ui-monospace, monospace; }
  .themes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
  h3 { margin: 0 0 8px; font-size: 14px; color: var(--muted); }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  figure { margin: 0; }
  img { display: block; width: 100%; height: auto; border: 1px solid var(--line); }
  figcaption { font-size: 12px; color: var(--muted); margin-top: 4px; }
  .missing div { aspect-ratio: 9 / 20; display: grid; place-items: center; border: 1px dashed var(--line); color: var(--muted); }
  @media (max-width: 900px) { .themes { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<h1>Masa: üç yön, P0 ekranları</h1>
<p class="lede">Her satır bir ekran; her yön için açık ve koyu. Görüntüler E2E koşusundan (Android emülatörü).</p>
${rows || '<p>Ekran görüntüsü yok.</p>'}
</body>
</html>
`;

writeFileSync(join(site, 'index.html'), html);
console.log(`index.html: ${screens.size} screens`);
