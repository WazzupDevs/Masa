import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// Step 23.4 (docs/SPEC_V3.md §23.H): the "Tanışalım mı?" window's data went in two PRs. 23.4a took
// every reader out of the app, the Edge Functions and the scripts; 23.4b's migration
// (…_reveal_cleanup.sql) then dropped the tables, the columns and their functions. This showed the
// first half before the migration, and keeps them from coming back: nothing outside the generated
// types (database.ts) names them, and nothing calls the `reveal` Edge Function.
const root = resolve(import.meta.dirname, '..');
const SOURCES = ['apps/mobile/app', 'apps/mobile/src', 'supabase/functions', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', 'android', 'ios', '.expo', 'dist']);
const SKIP_FILES = new Set([
  'supabase/functions/_shared/pure/database.ts',
  // This file names what it looks for.
  'scripts/reveal-removed.test.ts',
]);

// The window's columns on rooms, its tables, the lobby hold and the SQL functions that read them.
const NAMES = [
  'reveal_ends_at',
  'reveal_result',
  'reveal_token',
  'reveal_decisions',
  'reveal_signals',
  'lobby_listed_from',
  'room_listed_from',
  'rooms_lobby_held',
  'reveal_decide',
  'reveal_finalize',
  'reveal_matches',
];
// A call of the `reveal` Edge Function: invoke('reveal', …), invoke<T>('reveal', …), a test's
// invoke(client, 'reveal', …), the bot's call('reveal', …) or its URL.
const REVEAL_CALL =
  /\b(?:invoke|call)(?:<[^>]*>)?\(\s*(?:\w+\s*,\s*)?['"`]reveal['"`]|functions\/v1\/reveal\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !SKIP_FILES.has(path) ? [path] : [];
  });
}

describe('the "Tanışalım mı?" window has no reader left (step 23.4a)', () => {
  const files = SOURCES.flatMap(sourceFiles);

  it('looks at the app, the Edge Functions and the scripts', () => {
    expect(files).toContain('apps/mobile/src/features/rooms/queries.ts');
    expect(files).toContain('supabase/functions/rooms/index.ts');
    expect(files).toContain('scripts/e2e/bot-table.ts');
  });

  it('names none of its columns, tables or functions outside the generated types', () => {
    const found = files.flatMap((file) => {
      const text = readFileSync(resolve(root, file), 'utf8');
      return NAMES.filter((name) => new RegExp(`\\b${name}\\b`).test(text)).map(
        (name) => `${relative('.', file)}: ${name}`,
      );
    });
    expect(found).toEqual([]);
  });

  it('never calls the reveal Edge Function', () => {
    const found = files.filter((file) =>
      REVEAL_CALL.test(readFileSync(resolve(root, file), 'utf8')),
    );
    expect(found).toEqual([]);
  });
});
