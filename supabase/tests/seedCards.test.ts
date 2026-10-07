import { readFileSync } from 'node:fs';

import { afterAll, describe, expect, it } from 'vitest';

import {
  parseHarfCategories,
  parseIbreScales,
  parseProfanity,
  parseSahtekarWords,
  parseSarkiWords,
  parseSohbetCards,
  parseTabuCards,
} from '../../scripts/seed/content.ts';
import { cardsSql } from '../../scripts/seed/sections.ts';
import { sql } from './local.ts';

// The seed's card section against the local database: a card taken out of its deck's JSON is
// retired (is_active = false), never deleted, so past games and room_used_cards keep pointing at
// it; the other decks are untouched.
const read = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const profanity = parseProfanity(read('content/profanity-tr.json'));
const decks = () => ({
  tabu: parseTabuCards(read('content/tabu-cards.json')),
  sohbet: parseSohbetCards(read('content/sohbet-cards.json')),
  sahtekar: parseSahtekarWords(read('content/sahtekar-words.json'), profanity),
  harf: parseHarfCategories(read('content/harf-categories.json'), profanity),
  sarki: parseSarkiWords(read('content/sarki-words.json'), profanity),
  ibre: parseIbreScales(read('content/ibre-scales.json'), profanity),
});
const apply = async (d: ReturnType<typeof decks>) => {
  await sql.unsafe(cardsSql(d.tabu, d.sohbet, d.sahtekar, d.harf, d.sarki, d.ibre));
};
const counts = async () =>
  Object.fromEntries(
    (
      await sql`
        select deck, count(*) filter (where is_active)::int as active, count(*)::int as total
        from public.cards group by deck
      `
    ).map((r) => [r.deck as string, { active: r.active as number, total: r.total as number }]),
  );

afterAll(async () => {
  // Back to the content as committed.
  await apply(decks());
  await sql.end();
});

describe('the seed retires cards taken out of the content', () => {
  it('marks only the removed card inactive and keeps its row; putting it back revives it', async () => {
    const full = decks();
    await apply(full);
    const before = await counts();
    const removed = full.sarki[0];
    if (!removed) throw new Error('no sarki words');
    const [row] = await sql`
      select id, is_active from public.cards where deck = 'sarki' and source_key = ${removed.key}
    `;
    expect(row?.is_active).toBe(true);

    await apply({ ...full, sarki: full.sarki.slice(1) });
    const [after] = await sql`
      select id, is_active from public.cards where deck = 'sarki' and source_key = ${removed.key}
    `;
    expect(after).toEqual({ id: row?.id, is_active: false });
    expect(await counts()).toEqual({
      ...before,
      sarki: { active: (before.sarki?.active ?? 0) - 1, total: before.sarki?.total },
    });

    await apply(full);
    const [back] = await sql`
      select id, is_active from public.cards where deck = 'sarki' and source_key = ${removed.key}
    `;
    expect(back).toEqual({ id: row?.id, is_active: true });
    expect(await counts()).toEqual(before);
  });
});
