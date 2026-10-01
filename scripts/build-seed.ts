// Builds supabase/seeds/content-<id>.sql from content/*.json and removes the file it replaces.
// The output is committed. Why the name changes with the content: scripts/seed/build.ts.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSeed, isSeedFileName, SEEDS_DIR, seedFileName } from './seed/build.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, SEEDS_DIR);
mkdirSync(dir, { recursive: true });

const existing = readdirSync(dir)
  .filter(isSeedFileName)
  .map((name) => ({ name, sql: readFileSync(resolve(dir, name), 'utf8') }));
const seed = buildSeed(root);
const name = seedFileName(seed.sql, existing);

writeFileSync(resolve(dir, name), seed.sql);
for (const file of existing) {
  if (file.name !== name) rmSync(resolve(dir, file.name));
}
console.log(
  `Wrote ${SEEDS_DIR}/${name} (${seed.venues} venues, ${seed.testVenues} test venues, ${seed.campusVenues} campus venues)`,
);
