import { describe, expect, it } from 'vitest';

import { TABLE_AVATAR_ICONS, tableAvatar } from './tableAvatar.ts';

// Aliases as the server makes them (pure/alias.ts): an adjective and a noun, 25 × 24 of them.
const ADJECTIVES = [
  'Mor',
  'Mavi',
  'Yeşil',
  'Sarı',
  'Turuncu',
  'Kırmızı',
  'Beyaz',
  'Gri',
  'Lacivert',
  'Turkuaz',
  'Altın',
  'Gümüş',
  'Bakır',
  'Bordo',
  'Lila',
  'Eflatun',
  'Zümrüt',
  'Mercan',
  'Fildişi',
  'Neşeli',
  'Cesur',
  'Bilge',
  'Zarif',
  'Parlak',
  'Sakin',
];
const NOUNS = [
  'Aslan',
  'Kaplan',
  'Vaşak',
  'Kurt',
  'Kedi',
  'Tavşan',
  'Sincap',
  'Kirpi',
  'Kunduz',
  'Rakun',
  'Panda',
  'Koala',
  'Suricat',
  'Yunus',
  'Penguen',
  'Kartal',
  'Baykuş',
  'Kuğu',
  'Martı',
  'Flamingo',
  'Turna',
  'Leylek',
  'Bülbül',
  'Serçe',
];
const ids = ADJECTIVES.flatMap((a) => NOUNS.map((n) => `${a} ${n}`));

describe('tableAvatar', () => {
  it('gives the same alias the same icon and colour', () => {
    const id = 'Meraklı Orman';
    expect(tableAvatar(id, 8)).toEqual(tableAvatar(id, 8));
  });

  it('stays inside the icon and colour ranges', () => {
    for (const id of ids) {
      const { icon, color } = tableAvatar(id, 8);
      expect(icon).toBeGreaterThanOrEqual(0);
      expect(icon).toBeLessThan(TABLE_AVATAR_ICONS);
      expect(color).toBeGreaterThanOrEqual(0);
      expect(color).toBeLessThan(8);
      expect(Number.isInteger(icon) && Number.isInteger(color)).toBe(true);
    }
  });

  it('uses every icon and every colour across many aliases', () => {
    const icons = new Set(ids.map((id) => tableAvatar(id, 8).icon));
    const colors = new Set(ids.map((id) => tableAvatar(id, 8).color));
    expect(icons.size).toBe(TABLE_AVATAR_ICONS);
    expect(colors.size).toBe(8);
  });

  it('spreads aliases over the icons', () => {
    const counts = new Array<number>(TABLE_AVATAR_ICONS).fill(0);
    for (const id of ids)
      counts[tableAvatar(id, 8).icon] = (counts[tableAvatar(id, 8).icon] ?? 0) + 1;
    // 600 aliases over 12 icons: about 50 each.
    for (const n of counts) expect(n).toBeGreaterThan(20);
  });

  it('picks the colour independently of the icon', () => {
    const pairs = new Set(ids.map((id) => JSON.stringify(tableAvatar(id, 8))));
    expect(pairs.size).toBeGreaterThan(70);
  });

  it('does not depend on anything but the alias', () => {
    expect(tableAvatar('a', 8)).toEqual({
      icon: tableAvatar('a', 8).icon,
      color: tableAvatar('a', 8).color,
    });
    expect(tableAvatar('a', 8)).not.toEqual(tableAvatar('b', 8));
  });
});
