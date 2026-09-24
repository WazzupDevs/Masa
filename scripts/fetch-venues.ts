// Usage: pnpm fetch:venues
// Fetches Beylikdüzü cafes and hookah lounges from the OpenStreetMap Overpass API and writes
// content/venues-pilot.json. Review the result by hand (set isActive: false to drop a venue),
// then run `pnpm seed`. Manual isActive: false flags survive re-fetching.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseVenuesFile } from './seed/content.ts';
import { buildQuery, toVenuesFile } from './venues/overpass.ts';

const OVERPASS_URL = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = resolve(root, 'content/venues-pilot.json');

const previous = existsSync(outFile)
  ? parseVenuesFile(JSON.parse(readFileSync(outFile, 'utf8')))
  : null;

const response = await fetch(OVERPASS_URL, {
  method: 'POST',
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
    'user-agent': 'masa-venue-seed/1.0 (one-off pilot import)',
  },
  body: new URLSearchParams({ data: buildQuery() }),
});
if (!response.ok) {
  throw new Error(`Overpass returned ${response.status}: ${await response.text()}`);
}

const file = toVenuesFile(await response.json(), new Date().toISOString(), previous);
writeFileSync(outFile, `${JSON.stringify(file, null, 2)}\n`);
console.log(`Wrote ${file.venues.length} venues to ${outFile}. Review them, then run pnpm seed.`);
