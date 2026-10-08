// An anonymous table's avatar (Aşama 8 · Saha): one of the game-night icons on one of the disc
// colours, picked from the table's alias. The same alias always gets the same pair, so a table has
// one face on every phone and every screen (its own one too); a new name may bring another.
// No randomness at draw time: the pick is a hash of the alias (FNV-1a, 32 bit).

export const TABLE_AVATAR_ICONS = 12;

function fnv1a(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// `colors`: how many disc colours the app has. The icon comes from the low bits of the hash, the
// colour from the high bits, so the two do not move together.
export function tableAvatar(
  seed: string,
  colors: number,
  icons: number = TABLE_AVATAR_ICONS,
): { icon: number; color: number } {
  const h = fnv1a(seed);
  return { icon: h % icons, color: Math.floor(h / 65536) % colors };
}
