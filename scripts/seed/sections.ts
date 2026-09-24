import type { AliasWords } from '../../supabase/functions/_shared/pure/alias.ts';
import type { SohbetCard, TabuCard, VenueRecord } from './content.ts';
import { sqlLiteral } from './sql.ts';

// Replaces the word list, so words removed from the JSON disappear from the database too.
export function aliasWordsSql(words: AliasWords): string {
  const rows = [
    ...words.adjectives.map((w) => `(${sqlLiteral('adjective')}, ${sqlLiteral(w)})`),
    ...words.animals.map((w) => `(${sqlLiteral('animal')}, ${sqlLiteral(w)})`),
  ];
  return [
    '-- content/aliases-tr.json',
    'delete from public.alias_words;',
    `insert into public.alias_words (kind, word) values\n  ${rows.join(',\n  ')};`,
    '',
  ].join('\n');
}

// Upsert by (source, source_ref): safe to re-run on a hosted project, keeps venue ids stable.
export function venuesSql(venues: readonly VenueRecord[]): string {
  if (venues.length === 0) return '-- content/venues-pilot.json: no venues\n';
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
    '-- content/venues-pilot.json (© OpenStreetMap contributors, ODbL)',
    'insert into public.venues (name, city, district, location, source, source_ref, is_active) values',
    `  (${rows.join('),\n  (')})`,
    'on conflict (source, source_ref) do update set',
    '  name = excluded.name, city = excluded.city, district = excluded.district,',
    '  location = excluded.location, is_active = excluded.is_active;',
    '',
  ].join('\n');
}

// Replaces the list; only server code reads it (chat and clue filtering).
export function profanitySql(terms: readonly string[]): string {
  return [
    '-- content/profanity-tr.json',
    'delete from public.profanity_terms;',
    `insert into public.profanity_terms (term) values\n  ${terms.map((t) => `(${sqlLiteral(t)})`).join(',\n  ')};`,
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
