import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { functionNames, linkedProjectRef } from './config.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('functionNames', () => {
  it('reads the [functions.*] blocks, sorted, once each', () => {
    const toml = [
      '[api]',
      'port = 1',
      '# a comment',
      '[functions.venue-chat]',
      'verify_jwt = false',
      '[functions.account] # with a comment',
      '[functions.account]',
      '[functions.sms.secrets]',
      '[edge_runtime]',
    ].join('\n');
    expect(functionNames(toml)).toEqual(['account', 'venue-chat']);
  });

  // pnpm functions:deploy publishes this list: every function folder has a block and every block
  // a folder, so none is left out.
  it('matches the function folders in the repo', () => {
    const names = functionNames(readFileSync(resolve(root, 'supabase/config.toml'), 'utf8'));
    const folders = readdirSync(resolve(root, 'supabase/functions'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
      .map((d) => d.name)
      .sort();
    expect(names).toEqual(folders);
    expect(names.length).toBeGreaterThan(0);
  });

  // Step 23.4 (docs/SPEC_V3.md §23.J): the `reveal` function left the repo, 18 → 17. CLAUDE.md and
  // docs/PILOT_RELEASE.md give the same count; a new function changes all three.
  it('lists 17 functions, without reveal', () => {
    const names = functionNames(readFileSync(resolve(root, 'supabase/config.toml'), 'utf8'));
    expect(names).toHaveLength(17);
    expect(names).not.toContain('reveal');
  });
});

describe('linkedProjectRef', () => {
  it('takes a project ref and nothing else', () => {
    expect(linkedProjectRef('abcdefghijklmnopqrst\n')).toBe('abcdefghijklmnopqrst');
    expect(linkedProjectRef(null)).toBeNull();
    expect(linkedProjectRef('')).toBeNull();
    expect(linkedProjectRef('not a ref')).toBeNull();
  });
});
