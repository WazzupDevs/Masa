// What a merge to main publishes to the hosted dev project (.github/workflows/deploy-dev.yml): the
// steps of CLAUDE.md → "main'den dev projesine yayın" in the same order (migrations and seed, then
// the functions, then the OTA update to the preview channel), each only when its files changed since
// the last deploy that succeeded. Only ever the dev project (pure/devProject.ts); the pilot and Play
// project is never listed anywhere in the repo, so nothing here can name it.
import {
  DEV_PROJECT_HOST,
  isDevProjectUrl,
} from '../../supabase/functions/_shared/pure/devProject.ts';

const SUPABASE_HOST = /^([a-z0-9]{20})\.supabase\.co$/;

// The dev project's ref, from its host (kphw…mski.supabase.co → kphw…mski).
export function devProjectRef(): string {
  const ref = SUPABASE_HOST.exec(DEV_PROJECT_HOST)?.[1];
  if (!ref) throw new Error(`DEV_PROJECT_HOST is not a Supabase project host: ${DEV_PROJECT_HOST}`);
  return ref;
}

// `supabase link` stores the ref in supabase/.temp/project-ref; the workflow publishes nothing
// unless it is the dev project's.
export function isDevProjectRef(linked: string | null): boolean {
  return (linked?.trim() ?? '') === devProjectRef();
}

// EXPO_PUBLIC_SUPABASE_URL of the EAS preview environment, which goes into the OTA bundle: the
// update is sent only when it is the dev project's address (a production URL there would point
// every preview phone at the pilot's database).
export function isDevSupabaseUrl(url: string | null): boolean {
  return isDevProjectUrl((url ?? '').trim().replace(/\/+$/, ''));
}

const MIGRATIONS = ['supabase/migrations/', 'supabase/seeds/'];
const FUNCTIONS = ['supabase/functions/', 'supabase/config.toml'];
// CLAUDE.md → "Neyi ne zaman yayınlamalı": the JS bundle is the app and the shared pure/ code.
const APP = ['apps/mobile/', 'supabase/functions/_shared/pure/'];

// Changes an OTA update cannot carry (CLAUDE.md → "Neyi ne zaman yayınlamalı": native module, config
// plugin, a native field of app.json/app.config.ts, icon and splash). Without a new `version` the
// update would reach builds that lack them.
const NATIVE_FILES = ['apps/mobile/app.json', 'apps/mobile/app.config.ts'];
const NATIVE_DIRS = ['apps/mobile/assets/icon/'];

export type AppState = {
  // app.json → expo.version (the runtime version, appVersion policy).
  version: string;
  // apps/mobile/package.json → dependencies (devDependencies never reach the build).
  dependencies: Record<string, string>;
};

export type DeployPlan = {
  migrations: boolean;
  functions: boolean;
  ota: boolean;
  // The app changed in a way an OTA update cannot carry while `version` stayed the same: the update
  // waits for a person (a new build, or a manual run that says the change is JS only).
  otaHeld: string[];
};

function touches(changed: readonly string[], prefixes: readonly string[]): boolean {
  return changed.some((file) => prefixes.some((p) => file === p || file.startsWith(p)));
}

function sameDependencies(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => a[k] === b[k]);
}

// The native changes between the last deploy and now; none when `version` changed (that commit
// needs a new build anyway, and an update for the new runtime reaches only the new build).
export function nativeChanges(
  changed: readonly string[],
  before: AppState,
  after: AppState,
): string[] {
  if (before.version !== after.version) return [];
  const reasons = changed.filter(
    (f) => NATIVE_FILES.includes(f) || NATIVE_DIRS.some((d) => f.startsWith(d)),
  );
  if (!sameDependencies(before.dependencies, after.dependencies)) {
    reasons.push('apps/mobile/package.json → dependencies');
  }
  return reasons;
}

// `changed` is null when there is no earlier deploy to compare with (the first run, or a manual run
// that asks for everything): then every step runs. `forceOta` is a manual run's word that the
// app's change is JS only.
export function planDeploy(input: {
  changed: readonly string[] | null;
  native: readonly string[];
  forceOta: boolean;
}): DeployPlan {
  const { changed, native, forceOta } = input;
  const all = changed === null;
  const app = all || touches(changed, APP);
  const otaHeld = app && !forceOta ? [...native] : [];
  return {
    migrations: all || touches(changed, MIGRATIONS),
    functions: all || touches(changed, FUNCTIONS),
    ota: app && otaHeld.length === 0,
    otaHeld,
  };
}

// The commits earlier successful runs deployed, from their run names (`deploy-dev <sha>`). A dry
// run (`deploy-dev dry run`) and a run whose ci did not pass (`deploy-dev skipped …`) never count.
// The caller picks the newest of them in main's history (cli.ts).
const DEPLOYED_RUN = /^deploy-dev ([0-9a-f]{40})$/;

export function deployedShas(runTitles: readonly string[]): string[] {
  const shas = runTitles.map((t) => DEPLOYED_RUN.exec(t.trim())?.[1]).filter((s) => s != null);
  return [...new Set(shas)];
}

// CLAUDE.md → "main'den dev projesine yayın" step 6: after a deploy every row of `supabase migration
// list` has the same version on both sides. `--output-format json` prints one line on stdout,
// `{"migrations":[{"local","remote","time"}],"message"}`, a side empty where the repo or the project
// lacks that version.
export type MigrationRow = { local: string; remote: string };

export function migrationRows(stdout: string): MigrationRow[] {
  const line = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{'))
    .at(-1);
  const parsed = JSON.parse(line ?? '{}') as { migrations?: unknown };
  if (!Array.isArray(parsed.migrations) || parsed.migrations.length === 0) {
    throw new Error('supabase migration list okunamadı');
  }
  return parsed.migrations.map((m: { local?: unknown; remote?: unknown }) => ({
    local: typeof m.local === 'string' ? m.local : '',
    remote: typeof m.remote === 'string' ? m.remote : '',
  }));
}

// The rows where the two sides differ: not yet on the project, or on the project but not in main.
export function migrationMismatches(rows: readonly MigrationRow[]): string[] {
  return rows
    .filter((r) => r.local !== r.remote)
    .map((r) => (r.local ? `${r.local} (yalnızca Local)` : `${r.remote} (yalnızca Remote)`));
}

// `functions deploy` publishes config.toml's functions and deletes none: a function that left the repo
// (reveal, step 23.4) stays ACTIVE on the project until `supabase functions delete <name>`.
// `--output-format json functions list` prints `{"functions":[{"slug","name","status",…}],"message"}`
// on one line, as `migration list` does. The run only reads it: a person deletes (CLAUDE.md →
// "main'den dev projesine yayın" step 6).
export function deployedFunctions(stdout: string): string[] {
  const line = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{'))
    .at(-1);
  const parsed = JSON.parse(line ?? '{}') as { functions?: unknown };
  if (!Array.isArray(parsed.functions)) throw new Error('supabase functions list okunamadı');
  return parsed.functions
    .map((f: { slug?: unknown; name?: unknown }) =>
      typeof f.slug === 'string' ? f.slug : typeof f.name === 'string' ? f.name : '',
    )
    .filter((s) => s !== '')
    .sort();
}

// The project's functions that config.toml no longer names.
export function staleFunctions(deployed: readonly string[], inRepo: readonly string[]): string[] {
  return deployed.filter((name) => !inRepo.includes(name));
}

export function appState(appJson: string, packageJson: string): AppState {
  const app = JSON.parse(appJson) as { expo?: { version?: unknown } };
  const pkg = JSON.parse(packageJson) as { dependencies?: Record<string, string> };
  const version = app.expo?.version;
  if (typeof version !== 'string') throw new Error('apps/mobile/app.json has no expo.version');
  return { version, dependencies: pkg.dependencies ?? {} };
}
