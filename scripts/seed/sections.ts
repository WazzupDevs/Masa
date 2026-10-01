import type { AliasWords } from '../../supabase/functions/_shared/pure/alias.ts';
import type { LngLat } from '../../supabase/functions/_shared/pure/geo.ts';
import type {
  CampusSpot,
  CampusVenue,
  ProfanityList,
  SohbetCard,
  TabuCard,
  TestVenue,
  VenueRecord,
} from './content.ts';
import { sqlLiteral } from './sql.ts';

// Replaces the word list, so words removed from the JSON disappear from the database too.
export function aliasWordsSql(words: AliasWords): string {
  const rows = [
    ...words.adjectives.map((w) => `(${sqlLiteral('adjective')}, ${sqlLiteral(w)})`),
    ...words.nouns.map((w) => `(${sqlLiteral('noun')}, ${sqlLiteral(w)})`),
  ];
  return [
    '-- content/aliases-tr.json',
    'delete from public.alias_words;',
    `insert into public.alias_words (kind, word) values\n  ${rows.join(',\n  ')};`,
    '',
  ].join('\n');
}

// Upsert by (source, source_ref): safe to re-run on a hosted project, keeps venue ids stable.
// A venue removed from the JSON stays in the database; set isActive: false to hide it.
export function venuesSql(
  venues: readonly VenueRecord[],
  file = 'content/venues-pilot.json',
  attribution: string | null = '© OpenStreetMap contributors, ODbL',
): string {
  if (venues.length === 0) return `-- ${file}: no venues\n`;
  const rows = venues.map((v) =>
    [
      sqlLiteral(v.name),
      sqlLiteral(v.city),
      sqlLiteral(v.district),
      `extensions.st_setsrid(extensions.st_makepoint(${sqlLiteral(v.lng)}, ${sqlLiteral(v.lat)}), 4326)::extensions.geography`,
      sqlLiteral(v.source),
      sqlLiteral(v.sourceRef),
      sqlLiteral(v.isActive),
    ].join(', '),
  );
  return [
    `-- ${file}${attribution ? ` (${attribution})` : ''}`,
    'insert into public.venues (name, city, district, location, source, source_ref, is_active) values',
    `  (${rows.join('),\n  (')})`,
    'on conflict (source, source_ref) do update set',
    '  name = excluded.name, city = excluded.city, district = excluded.district,',
    '  location = excluded.location, is_active = excluded.is_active;',
    '',
  ].join('\n');
}

// Replaces the list; only server code reads it (chat and clue filtering).
export function profanitySql({ terms, wholeWords }: ProfanityList): string {
  const rows = [
    ...terms.map((t) => `(${sqlLiteral(t)}, false)`),
    ...wholeWords.map((t) => `(${sqlLiteral(t)}, true)`),
  ];
  return [
    '-- content/profanity-tr.json',
    'delete from public.profanity_terms;',
    `insert into public.profanity_terms (term, whole_word) values\n  ${rows.join(',\n  ')};`,
    '',
  ].join('\n');
}

// Upserts cards by (deck, source_key) and deactivates the ones no longer in the JSON: cards may be
// referenced by past games, so they are never deleted.
export function cardsSql(tabu: readonly TabuCard[], sohbet: readonly SohbetCard[]): string {
  const tabuRows = tabu.map(
    (c) =>
      `('tabu', ${sqlLiteral(c.word)}, ${sqlLiteral(c.word)}, ${sqlLiteral(c.forbidden)}, null, null)`,
  );
  const sohbetRows = sohbet.map(
    (c) =>
      `('sohbet', ${sqlLiteral(c.prompt)}, null, null, ${sqlLiteral(c.theme)}, ${sqlLiteral(c.prompt)})`,
  );
  return [
    '-- content/tabu-cards.json, content/sohbet-cards.json',
    'update public.cards set is_active = false;',
    'insert into public.cards (deck, source_key, word, forbidden, theme, prompt) values',
    `  ${[...tabuRows, ...sohbetRows].join(',\n  ')}`,
    'on conflict (deck, source_key) do update set',
    '  word = excluded.word, forbidden = excluded.forbidden, theme = excluded.theme,',
    '  prompt = excluded.prompt, is_active = true;',
    '',
  ].join('\n');
}

// A venue with a boundary and spots. Upserted by ('campus', ref) and (venue, spot ref): safe to
// re-run, keeps ids stable, never deletes (a spot left out of the JSON stays as it was; set
// isActive: false to retire it). The venue's point, used by Keşfet's map, is `location` when
// given (checked to be inside), else a point on the boundary's surface.
export const CAMPUS_SOURCE = 'campus';

// A venue's spots, upserted by (venue, ref) in the JSON's order; never deleted.
export function spotsSql(source: string, sourceRef: string, spots: readonly CampusSpot[]): string {
  if (spots.length === 0) return `-- ${sourceRef}: no spots`;
  const rows = spots.map(
    (s, i) => `(${sqlLiteral(s.ref)}, ${sqlLiteral(s.name)}, ${i}, ${sqlLiteral(s.isActive)})`,
  );
  return [
    'insert into public.venue_spots (venue_id, ref, name, sort, is_active)',
    'select v.id, s.ref, s.name, s.sort, s.is_active',
    `from public.venues v cross join (values\n  ${rows.join(',\n  ')}\n) as s (ref, name, sort, is_active)`,
    `where v.source = ${sqlLiteral(source)} and v.source_ref = ${sqlLiteral(sourceRef)}`,
    'on conflict (venue_id, ref) do update set',
    '  name = excluded.name, sort = excluded.sort, is_active = excluded.is_active;',
  ].join('\n');
}

// Spots of the test venues that have them, after the venues themselves.
export function testSpotsSql(venues: readonly TestVenue[]): string[] {
  return venues
    .filter((v) => v.spots.length > 0)
    .map(
      (v) =>
        `-- content/venues-test.json: spots of ${v.sourceRef}\n${spotsSql(v.source, v.sourceRef, v.spots)}\n`,
    );
}

function polygonSql(ring: readonly LngLat[]): string {
  const wkt = `POLYGON((${ring.map(([lng, lat]) => `${lng} ${lat}`).join(', ')}))`;
  return `extensions.st_geomfromtext(${sqlLiteral(wkt)}, 4326)`;
}

export function campusSql(
  venues: readonly CampusVenue[],
  file = 'content/venues-campus.json',
): string {
  if (venues.length === 0) return `-- ${file}: no venues\n`;
  return [
    `-- ${file}`,
    ...venues.flatMap((v) => {
      const polygon = polygonSql(v.boundary);
      return [
        'insert into public.venues (name, city, district, location, boundary, source, source_ref, is_active) values',
        `  (${[
          sqlLiteral(v.name),
          sqlLiteral(v.city),
          sqlLiteral(v.district),
          v.location
            ? `extensions.st_setsrid(extensions.st_makepoint(${v.location.lng}, ${v.location.lat}), 4326)::extensions.geography`
            : `extensions.st_pointonsurface(${polygon})::extensions.geography`,
          `${polygon}::extensions.geography`,
          sqlLiteral(CAMPUS_SOURCE),
          sqlLiteral(v.ref),
          sqlLiteral(v.isActive),
        ].join(', ')})`,
        'on conflict (source, source_ref) do update set',
        '  name = excluded.name, city = excluded.city, district = excluded.district,',
        '  location = excluded.location, boundary = excluded.boundary, is_active = excluded.is_active;',
        spotsSql(CAMPUS_SOURCE, v.ref, v.spots),
        '',
      ];
    }),
  ].join('\n');
}
