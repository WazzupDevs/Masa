// The steps of .github/workflows/deploy-dev.yml that read the repo (node --experimental-strip-types):
//   ref              prints the dev project's ref (pure/devProject.ts)
//   check-link       fails unless `supabase link` stored the dev project's ref
//   check-url <url>  fails unless the URL is the dev project's address
//   check-migrations <file>
//                    `supabase --output-format json migration list`'s output: fails unless Local
//                    and Remote are the same on every row (a dry run only lists the difference)
//   check-functions <file>
//                    `supabase --output-format json functions list`'s output: names, as a warning,
//                    the project's functions that config.toml no longer has; never fails
//   plan             what to publish since the last successful deploy (plan.ts), as step outputs
// `plan` reads SHA (the commit to deploy), RUN_TITLES (names of earlier successful runs, one per
// line), EVERYTHING and FORCE_OTA ('true' from a manual run). Every summary line goes to the log too:
// the run page's summary is not readable through the API, the log is.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { functionNames } from '../functions/config.ts';
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

function git(...args: string[]): { ok: boolean; out: string } {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return { ok: r.status === 0, out: r.stdout ?? '' };
}

function gitOut(...args: string[]): string {
  const r = git(...args);
  if (!r.ok) throw new Error(`git ${args.join(' ')} başarısız`);
  return r.out;
}

function isAncestor(a: string, b: string): boolean {
  return git('merge-base', '--is-ancestor', a, b).ok;
}

function stateAt(sha: string) {
  return appState(
    gitOut('show', `${sha}:apps/mobile/app.json`),
    gitOut('show', `${sha}:apps/mobile/package.json`),
  );
}

function output(values: Record<string, string>): void {
  const lines = Object.entries(values).map(([k, v]) => `${k}=${v}`);
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
}

function summary(markdown: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, `${markdown}\n`);
  console.log(markdown);
}

function plan(): void {
  const sha = process.env.SHA ?? '';
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`SHA bir commit değil: ${sha}`);
  const everything = process.env.EVERYTHING === 'true';
  const forceOta = process.env.FORCE_OTA === 'true';

  // Earlier deploys that are in main's history; the newest of them is where this one starts.
  const deployed = deployedShas((process.env.RUN_TITLES ?? '').split('\n')).filter(
    (s) => git('cat-file', '-e', `${s}^{commit}`).ok,
  );
  if (deployed.some((s) => s !== sha && isAncestor(sha, s))) {
    output({ skip: 'true', migrations: 'false', functions: 'false', ota: 'false', held: '' });
    summary(`Atlandı: ${sha.slice(0, 7)}'dan yeni bir commit zaten yayınlandı.`);
    return;
  }
  const behind = deployed.filter((s) => isAncestor(s, sha));
  const base = everything
    ? null
    : (behind.sort(
        (a, b) =>
          Number(gitOut('rev-list', '--count', b)) - Number(gitOut('rev-list', '--count', a)),
      )[0] ?? null);

  const changed = base
    ? gitOut('diff', '--name-only', base, sha)
        .split('\n')
        .filter((f) => f !== '')
    : null;
  const native = base && changed ? nativeChanges(changed, stateAt(base), stateAt(sha)) : [];
  const p = planDeploy({ changed, native, forceOta });

  output({
    skip: 'false',
    migrations: String(p.migrations),
    functions: String(p.functions),
    ota: String(p.ota),
    held: p.otaHeld.join(', '),
  });
  const from = base
    ? `\`${base.slice(0, 7)}\` → \`${sha.slice(0, 7)}\``
    : `hepsi (\`${sha.slice(0, 7)}\`)`;
  const yes = (b: boolean) => (b ? 'evet' : 'hayır');
  summary(
    [
      `### dev projesine yayın: ${from}`,
      '',
      '| Adım | Yayınlanacak |',
      '| --- | --- |',
      `| Migration ve seed | ${yes(p.migrations)} |`,
      `| Edge Function'lar | ${yes(p.functions)} |`,
      `| OTA (preview) | ${p.otaHeld.length > 0 ? `bekletildi: ${p.otaHeld.join(', ')}` : yes(p.ota)} |`,
      '',
    ].join('\n'),
  );
}

const [command, arg] = process.argv.slice(2);
switch (command) {
  case 'ref':
    console.log(devProjectRef());
    break;
  case 'check-link': {
    const file = resolve(root, 'supabase/.temp/project-ref');
    const linked = existsSync(file) ? readFileSync(file, 'utf8') : null;
    if (!isDevProjectRef(linked)) {
      console.error(
        `Bağlı proje dev projesi değil (${linked?.trim() || 'yok'}); hiçbir şey yayınlanmadı.`,
      );
      process.exit(1);
    }
    summary(`- Bağlı proje: \`${devProjectRef()}\` (dev).`);
    break;
  }
  case 'check-url':
    if (!isDevSupabaseUrl(arg ?? null)) {
      console.error(
        "EAS preview ortamındaki EXPO_PUBLIC_SUPABASE_URL dev projesinin adresi değil (ya da okunamadı: 'plaintext' olmalı); OTA gönderilmedi.",
      );
      process.exit(1);
    }
    summary('- EAS preview ortamı dev projesini gösteriyor.');
    break;
  case 'check-migrations': {
    const rows = migrationRows(readFileSync(arg ?? '', 'utf8'));
    const off = migrationMismatches(rows);
    if (off.length === 0) {
      summary(`- \`migration list\`: ${rows.length} migration, her satırda Local ve Remote aynı.`);
      break;
    }
    summary(
      `- \`migration list\`: ${off.length} satırda Local ve Remote farklı: ${off.join(', ')}.`,
    );
    if (process.env.DRY_RUN !== 'true') process.exit(1);
    break;
  }
  case 'check-functions': {
    // Read-only and never failing: a missing or unreadable list is a note, not a broken deploy.
    let deployed: string[];
    try {
      deployed = deployedFunctions(readFileSync(arg ?? '', 'utf8'));
    } catch {
      summary('- `functions list` okunamadı; projedeki fonksiyonlar denetlenmedi.');
      break;
    }
    const inRepo = functionNames(readFileSync(resolve(root, 'supabase/config.toml'), 'utf8'));
    const stale = staleFunctions(deployed, inRepo);
    if (stale.length === 0) {
      summary(`- Projedeki fonksiyonlar \`config.toml\` ile aynı (${inRepo.length}).`);
      break;
    }
    const names = stale.map((s) => `\`${s}\``).join(', ');
    console.log(
      `::warning::Projede olup config.toml'da olmayan fonksiyon: ${stale.join(', ')}. Elle sil: pnpm supabase functions delete <ad>.`,
    );
    summary(
      `- ⚠️ Projede olup \`config.toml\`'da olmayan fonksiyon: ${names}. \`functions deploy\` silmez; elle sil (CLAUDE.md → "main'den dev projesine yayın" adım 6).`,
    );
    break;
  }
  case 'plan':
    plan();
    break;
  default:
    console.error(
      'Kullanım: cli.ts ref | check-link | check-url <url> | check-migrations <dosya> | check-functions <dosya> | plan',
    );
    process.exit(1);
}
