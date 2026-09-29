import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SPACING } from './tokens';

const require = createRequire(import.meta.url);
const mobile = join(import.meta.dirname, '..', '..');

// Screens, features and the kit take colours, type, radii and shadows only from the theme. The
// theme folder itself is where the raw values live.
const SOURCES = ['app', 'src'];
const EXEMPT = ['src/theme/'];

// Anywhere in the code.
const FORBIDDEN: readonly [RegExp, string][] = [
  [/['"`]#[0-9a-fA-F]{3,8}['"`]/, 'hex colour literal'],
  [/\brgba?\(/, 'rgb()/rgba() literal'],
  [/\bcolor="[^"{]/, 'colour attribute literal'],
  [/\bsize=\{\d/, 'numeric icon size (use ICON)'],
  [/\bfont(?:Size|Weight|Family)\s*:/, 'font style (use a Text variant)'],
];

// Inside className strings.
const FORBIDDEN_CLASSES: readonly [RegExp, string][] = [
  [
    /\b(?:text|bg|border)-(?:white|black|neutral|gray|slate|zinc|stone|red|orange|amber|yellow|green|emerald|teal|blue|indigo|violet|purple|pink)\b/,
    'palette colour class',
  ],
  [/\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b/, 'type size class (use a Text variant)'],
  [/\bfont-(?:thin|light|normal|medium|semibold|bold|extrabold|black)\b/, 'weight class'],
  [/\brounded\b/, 'radius class (radii come from the theme)'],
  [/\bshadow\b/, 'shadow class'],
];

const CLASS_ATTR = /[cC]lassName=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('no hard-coded styles outside the theme', () => {
  const paths = SOURCES.flatMap((d) => files(join(mobile, d)))
    .map((p) => relative(mobile, p))
    .filter((p) => !EXEMPT.some((e) => p.startsWith(e)));

  it('finds the sources', () => {
    expect(paths.length).toBeGreaterThan(40);
  });

  it.each(paths)('%s', (path) => {
    const lines = readFileSync(join(mobile, path), 'utf8').split('\n');
    const problems: string[] = [];
    lines.forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return;
      for (const [pattern, what] of FORBIDDEN) {
        if (pattern.test(line)) problems.push(`${i + 1}: ${what}: ${line.trim()}`);
      }
      for (const match of line.matchAll(CLASS_ATTR)) {
        const classes = match[1] ?? match[2] ?? match[3] ?? '';
        for (const [pattern, what] of FORBIDDEN_CLASSES) {
          if (pattern.test(classes)) problems.push(`${i + 1}: ${what}: ${classes}`);
        }
      }
    });
    expect(problems).toEqual([]);
  });
});

describe('tailwind.config.js', () => {
  const config = require('../../tailwind.config.js') as {
    theme: Record<string, unknown> & { spacing: Record<string, string> };
  };

  it('spacing is the token scale', () => {
    const expected = Object.fromEntries(Object.entries(SPACING).map(([k, v]) => [k, `${v}px`]));
    expect(config.theme.spacing).toEqual(expected);
  });

  it('has no type sizes, weights, fonts or radii of its own', () => {
    expect(config.theme.fontSize).toEqual({});
    expect(config.theme.fontWeight).toEqual({});
    expect(config.theme.fontFamily).toEqual({});
    expect(config.theme.borderRadius).toEqual({ none: '0px', full: '9999px' });
  });
});
