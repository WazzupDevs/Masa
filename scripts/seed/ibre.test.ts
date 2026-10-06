import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { IBRE_MIN_SCALES, parseIbreScales, parseProfanity } from './content.ts';
import { cardsSql } from './sections.ts';

const read = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const profanity = parseProfanity(read('content/profanity-tr.json'));
const scales = (n: number) => ({
  scales: Array.from({ length: n }, (_, i) => ({
    key: `s${i}`,
    left: `Sol ${i}`,
    right: `Sağ ${i}`,
  })),
});

describe('content/ibre-scales.json (docs/SPEC_V3.md §20.5)', () => {
  it('holds at least 200 scales', () => {
    expect(
      parseIbreScales(read('content/ibre-scales.json'), profanity).length,
    ).toBeGreaterThanOrEqual(IBRE_MIN_SCALES);
  });

  it('refuses too few, an empty end, the same end twice, a repeated pair and a listed word', () => {
    expect(() => parseIbreScales(scales(20), profanity)).toThrow('at least 200');
    const empty = scales(210);
    (empty.scales[0] as { right: string }).right = ' ';
    expect(() => parseIbreScales(empty, profanity)).toThrow('right is required');
    const same = scales(210);
    same.scales.push({ key: 'ayni', left: 'Sıcak', right: 'SICAK' });
    expect(() => parseIbreScales(same, profanity)).toThrow('both ends');
    const repeat = scales(210);
    repeat.scales.push({ key: 'ters', left: 'Sağ 3', right: 'sol 3' });
    expect(() => parseIbreScales(repeat, profanity)).toThrow('twice');
    const key = scales(210);
    key.scales.push({ key: 's4', left: 'Yeni', right: 'Eski' });
    expect(() => parseIbreScales(key, profanity)).toThrow('key "s4" twice');
    const listed = scales(210);
    listed.scales.push({
      key: 'kotu',
      left: profanity.wholeWords[0] ?? profanity.terms[0] ?? '',
      right: 'Güzel',
    });
    expect(() => parseIbreScales(listed, profanity)).toThrow('profanity list');
  });

  it('seeds one card a scale: prompt the left end, word the right', () => {
    const sql = cardsSql(
      [],
      [],
      [],
      [],
      [],
      [{ key: 'ucuz_pahali', left: 'Ucuz', right: 'Pahalı' }],
    );
    expect(sql).toContain(`('ibre', 'ucuz_pahali', 'Pahalı', null, null, 'Ucuz')`);
    expect(sql).toContain('content/ibre-scales.json');
  });
});
