import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  appState,
  deployedFunctions,
  deployedShas,
  devProjectRef,
  isDevProjectRef,
  isDevSupabaseUrl,
  migrationMismatches,
  migrationRows,
  nativeChanges,
  planDeploy,
  staleFunctions,
} from './plan.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('the dev project only', () => {
  it('takes the ref from the dev project host', () => {
    expect(devProjectRef()).toMatch(/^[a-z0-9]{20}$/);
    expect(isDevProjectRef(`${devProjectRef()}\n`)).toBe(true);
  });

  it('refuses any other linked project, and none', () => {
    expect(isDevProjectRef('abcdefghijklmnopqrst')).toBe(false);
    expect(isDevProjectRef('')).toBe(false);
    expect(isDevProjectRef(null)).toBe(false);
  });

  it("sends the OTA only when the preview environment's URL is the dev project's", () => {
    const dev = `https://${devProjectRef()}.supabase.co`;
    expect(isDevSupabaseUrl(dev)).toBe(true);
    expect(isDevSupabaseUrl(`${dev}/`)).toBe(true);
    expect(isDevSupabaseUrl('https://abcdefghijklmnopqrst.supabase.co')).toBe(false);
    expect(isDevSupabaseUrl(`http://${devProjectRef()}.supabase.co`)).toBe(false);
    expect(isDevSupabaseUrl(`https://${devProjectRef()}.supabase.co.example.com`)).toBe(false);
    // A sensitive variable reads as stars; an empty or missing one as nothing.
    expect(isDevSupabaseUrl('***** (This is a sensitive env variable.)')).toBe(false);
    expect(isDevSupabaseUrl('')).toBe(false);
    expect(isDevSupabaseUrl(null)).toBe(false);
  });
});

describe('planDeploy', () => {
  const plan = (changed: string[] | null, native: string[] = [], forceOta = false) =>
    planDeploy({ changed, native, forceOta });

  it('publishes everything without an earlier deploy', () => {
    expect(plan(null)).toEqual({ migrations: true, functions: true, ota: true, otaHeld: [] });
  });

  it('publishes nothing for docs and tests', () => {
    expect(
      plan(['docs/SPEC_V3.md', 'supabase/tests/gender.test.ts', '.github/workflows/ci.yml']),
    ).toEqual({ migrations: false, functions: false, ota: false, otaHeld: [] });
  });

  it('runs db push for a migration or a new seed file', () => {
    expect(plan(['supabase/migrations/20261028090000_gender.sql']).migrations).toBe(true);
    expect(plan(['supabase/seeds/content-abc.sql']).migrations).toBe(true);
    expect(plan(['content/cards-tr.json']).migrations).toBe(false);
  });

  it('deploys the functions for a function, shared code or config.toml', () => {
    expect(plan(['supabase/functions/rooms/index.ts'])).toMatchObject({
      functions: true,
      ota: false,
    });
    expect(plan(['supabase/functions/_shared/http.ts'])).toMatchObject({
      functions: true,
      ota: false,
    });
    expect(plan(['supabase/config.toml']).functions).toBe(true);
  });

  it('sends the OTA only for the app or the shared pure code', () => {
    expect(plan(['apps/mobile/src/i18n/tr.ts'])).toMatchObject({ functions: false, ota: true });
    expect(plan(['supabase/functions/_shared/pure/gender.ts'])).toMatchObject({
      functions: true,
      ota: true,
    });
    expect(plan(['scripts/e2e/bot-table.ts']).ota).toBe(false);
  });

  it('holds the OTA on a native change, unless a manual run says it is JS only', () => {
    const changed = ['apps/mobile/app.json'];
    expect(plan(changed, ['apps/mobile/app.json'])).toEqual({
      migrations: false,
      functions: false,
      ota: false,
      otaHeld: ['apps/mobile/app.json'],
    });
    expect(plan(changed, ['apps/mobile/app.json'], true)).toMatchObject({
      ota: true,
      otaHeld: [],
    });
  });

  it('still publishes the server when the OTA is held', () => {
    const changed = ['supabase/migrations/x.sql', 'apps/mobile/package.json'];
    expect(plan(changed, ['apps/mobile/package.json → dependencies'])).toEqual({
      migrations: true,
      functions: false,
      ota: false,
      otaHeld: ['apps/mobile/package.json → dependencies'],
    });
  });
});

describe('nativeChanges', () => {
  const state = (version: string, dependencies: Record<string, string> = { expo: '~57.0.25' }) => ({
    version,
    dependencies,
  });

  it('finds app.json, app.config.ts, icons and splash, and the dependencies', () => {
    const changed = [
      'apps/mobile/app.json',
      'apps/mobile/app.config.ts',
      'apps/mobile/assets/icon/splash.png',
      'apps/mobile/assets/brand/snail.png',
      'apps/mobile/src/i18n/tr.ts',
    ];
    expect(
      nativeChanges(changed, state('0.3.0'), state('0.3.0', { expo: '~57.0.25', a: '1' })),
    ).toEqual([
      'apps/mobile/app.json',
      'apps/mobile/app.config.ts',
      'apps/mobile/assets/icon/splash.png',
      'apps/mobile/package.json → dependencies',
    ]);
  });

  it('finds a changed or removed dependency, not a devDependency', () => {
    const before = state('0.3.0', { expo: '~57.0.25', a: '1' });
    expect(nativeChanges([], before, state('0.3.0', { expo: '~57.0.26', a: '1' }))).toEqual([
      'apps/mobile/package.json → dependencies',
    ]);
    expect(nativeChanges([], before, state('0.3.0', { expo: '~57.0.25' }))).toEqual([
      'apps/mobile/package.json → dependencies',
    ]);
    expect(nativeChanges(['apps/mobile/package.json'], before, before)).toEqual([]);
  });

  it('holds nothing when the version changed (the update reaches only the new build)', () => {
    expect(
      nativeChanges(['apps/mobile/app.json'], state('0.3.0'), state('0.4.0', { b: '1' })),
    ).toEqual([]);
  });
});

describe('deployedShas', () => {
  const a = 'a'.repeat(40);
  const b = 'b'.repeat(40);

  it('reads deploys from run names, never a dry run or a skipped run', () => {
    expect(
      deployedShas([
        'deploy-dev dry run',
        `deploy-dev ${a}`,
        'deploy-dev skipped (ci did not pass)',
        `deploy-dev ${b}`,
        `deploy-dev ${a}`,
        `deploy-dev ${a.slice(1)}`,
        '',
      ]),
    ).toEqual([a, b]);
  });
});

describe('migration list', () => {
  // `supabase --output-format json migration list`, as CLI 2.117.0 prints it against the local stack.
  const out = (migrations: { local: string; remote: string }[]) =>
    `${JSON.stringify({
      migrations: migrations.map((m) => ({ ...m, time: '2026-10-30 09:00:00' })),
      message: 'Migrations listed',
    })}\n`;

  it('finds nothing when every row has the same version on both sides', () => {
    const rows = migrationRows(
      out([
        { local: '20261029090000', remote: '20261029090000' },
        { local: '20261030090000', remote: '20261030090000' },
      ]),
    );
    expect(rows).toHaveLength(2);
    expect(migrationMismatches(rows)).toEqual([]);
  });

  it('names a migration not yet on the project and one only on the project', () => {
    const rows = migrationRows(
      out([
        { local: '20261029090000', remote: '20261029090000' },
        { local: '', remote: '20261029100000' },
        { local: '20261030090000', remote: '' },
      ]),
    );
    expect(migrationMismatches(rows)).toEqual([
      '20261029100000 (yalnızca Remote)',
      '20261030090000 (yalnızca Local)',
    ]);
  });

  it('refuses output it cannot read (an error, or no rows)', () => {
    expect(() =>
      migrationRows('{"_tag":"Error","error":{"code":"LegacyDbConnectError","message":"x"}}\n'),
    ).toThrow();
    expect(() => migrationRows(out([]))).toThrow();
    expect(() => migrationRows('')).toThrow();
  });
});

describe('functions list', () => {
  // `supabase --output-format json functions list`, in the shape CLI 2.117.0 gives every listing
  // (migration list above): the API's function objects under `functions`.
  const out = (slugs: string[]) =>
    `${JSON.stringify({
      functions: slugs.map((slug, i) => ({ id: `id-${i}`, slug, name: slug, status: 'ACTIVE' })),
      message: '',
    })}\n`;

  it('reads the slugs, sorted', () => {
    expect(deployedFunctions(out(['rooms', 'account', 'reveal']))).toEqual([
      'account',
      'reveal',
      'rooms',
    ]);
    expect(deployedFunctions(out([]))).toEqual([]);
  });

  it('names a function on the project that config.toml no longer has', () => {
    expect(staleFunctions(['account', 'reveal', 'rooms'], ['account', 'rooms'])).toEqual([
      'reveal',
    ]);
    expect(staleFunctions(['account', 'rooms'], ['account', 'rooms', 'dm'])).toEqual([]);
  });

  it('refuses output it cannot read', () => {
    expect(() => deployedFunctions('{"_tag":"Error","error":{"message":"x"}}\n')).toThrow();
    expect(() => deployedFunctions('')).toThrow();
  });
});

describe('appState', () => {
  it("reads the repo's app.json version and dependencies", () => {
    const s = appState(
      readFileSync(resolve(root, 'apps/mobile/app.json'), 'utf8'),
      readFileSync(resolve(root, 'apps/mobile/package.json'), 'utf8'),
    );
    expect(s.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(s.dependencies['expo-updates']).toBeDefined();
  });

  it('refuses an app.json without a version', () => {
    expect(() => appState('{"expo":{}}', '{}')).toThrow();
  });
});
