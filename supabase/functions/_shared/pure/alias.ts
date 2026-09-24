export type AliasWords = { adjectives: readonly string[]; animals: readonly string[] };

export function formatAlias(adjective: string, animal: string): string {
  return `${adjective} ${animal}`;
}

// A random "Adjective Animal" not used by another active table at the venue; null if none left.
// `random` returns a number in [0, 1), like Math.random.
export function pickAlias(
  words: AliasWords,
  used: ReadonlySet<string>,
  random: () => number,
): string | null {
  const free: string[] = [];
  for (const adjective of words.adjectives) {
    for (const animal of words.animals) {
      const alias = formatAlias(adjective, animal);
      if (!used.has(alias)) free.push(alias);
    }
  }
  if (free.length === 0) return null;
  return free[Math.min(Math.floor(random() * free.length), free.length - 1)] ?? null;
}
