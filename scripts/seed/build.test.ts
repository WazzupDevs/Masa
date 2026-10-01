import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildSeed, isSeedFileName, SEEDS_DIR, seedFileName } from './build.ts';

const root = resolve(import.meta.dirname, '../..');

describe('seedFileName', () => {
  it('names a first file by its content', () => {
    expect(seedFileName('a', [])).toMatch(/^content-[0-9a-f]{12}\.sql$/);
    expect(seedFileName('a', [])).toBe(seedFileName('a', []));
    expect(seedFileName('a', [])).not.toBe(seedFileName('b', []));
  });

  it('keeps the name while the content is the same', () => {
    const a = { name: seedFileName('a', []), sql: 'a' };
    expect(seedFileName('a', [a])).toBe(a.name);
  });

  it('gives every change a name not used before, also when the content returns (A → B → A)', () => {
    const a = { name: seedFileName('a', []), sql: 'a' };
    const b = { name: seedFileName('b', [a]), sql: 'b' };
    const backToA = seedFileName('a', [b]);
    expect(new Set([a.name, b.name, backToA]).size).toBe(3);
  });

  it('replaces two files left by a merge with a new one, whatever their order', () => {
    const x = { name: 'content-000000000001.sql', sql: 'x' };
    const y = { name: 'content-000000000002.sql', sql: 'y' };
    const merged = seedFileName('x', [x, y]);
    expect(merged).toBe(seedFileName('x', [y, x]));
    expect([x.name, y.name]).not.toContain(merged);
  });
});

describe(SEEDS_DIR, () => {
  // CLAUDE.md → `pnpm seed`: the committed seed is the one file built from content/ as it is now.
  // Two branches that both run `pnpm seed` merge into two files without a git conflict; this fails
  // until `pnpm seed` is run again on the merge.
  it('holds exactly one seed file, built from the current content (run `pnpm seed`)', () => {
    const dir = resolve(root, SEEDS_DIR);
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    const [name] = files;
    expect(name !== undefined && isSeedFileName(name)).toBe(true);
    expect(readFileSync(resolve(dir, name ?? ''), 'utf8')).toBe(buildSeed(root).sql);
  });
});
