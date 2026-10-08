import { describe, expect, it } from 'vitest';

import { TABLE_AVATAR_ICONS, tableAvatar } from './tableAvatar.ts';

const ids = Array.from(
  { length: 600 },
  (_, i) =>
    `${(0x1f3a5c7e + i * 7919).toString(16).padStart(8, '0')}-4a1b-4c2d-8e3f-${i.toString(16).padStart(12, '0')}`,
);

describe('tableAvatar', () => {
  it('gives the same session the same icon and colour', () => {
    const id = '3f2a9c1e-77b4-4e0a-9a61-5d2c8e4b1f70';
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

  it('uses every icon and every colour across many sessions', () => {
    const icons = new Set(ids.map((id) => tableAvatar(id, 8).icon));
    const colors = new Set(ids.map((id) => tableAvatar(id, 8).color));
    expect(icons.size).toBe(TABLE_AVATAR_ICONS);
    expect(colors.size).toBe(8);
  });

  it('spreads sessions over the icons', () => {
    const counts = new Array<number>(TABLE_AVATAR_ICONS).fill(0);
    for (const id of ids)
      counts[tableAvatar(id, 8).icon] = (counts[tableAvatar(id, 8).icon] ?? 0) + 1;
    // 600 sessions over 12 icons: about 50 each.
    for (const n of counts) expect(n).toBeGreaterThan(20);
  });

  it('picks the colour independently of the icon', () => {
    const pairs = new Set(ids.map((id) => JSON.stringify(tableAvatar(id, 8))));
    expect(pairs.size).toBeGreaterThan(70);
  });

  it('does not depend on anything but the id', () => {
    expect(tableAvatar('a', 8)).toEqual({
      icon: tableAvatar('a', 8).icon,
      color: tableAvatar('a', 8).color,
    });
    expect(tableAvatar('a', 8)).not.toEqual(tableAvatar('b', 8));
  });
});
