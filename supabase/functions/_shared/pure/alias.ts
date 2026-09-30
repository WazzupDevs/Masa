// Table aliases are adjective + noun (docs/SPEC_V3.md §5.6): nouns are animals, food, plants,
// objects and nature, from content/aliases-tr.json.
export type AliasWords = { adjectives: readonly string[]; nouns: readonly string[] };

export function formatAlias(adjective: string, noun: string): string {
  return `${adjective} ${noun}`;
}

// A random "Adjective Noun" not used by another active table at the venue; null if none left.
// `random` returns a number in [0, 1), like Math.random.
export function pickAlias(
  words: AliasWords,
  used: ReadonlySet<string>,
  random: () => number,
): string | null {
  const free: string[] = [];
  for (const adjective of words.adjectives) {
    for (const noun of words.nouns) {
      const alias = formatAlias(adjective, noun);
      if (!used.has(alias)) free.push(alias);
    }
  }
  if (free.length === 0) return null;
  return free[Math.min(Math.floor(random() * free.length), free.length - 1)] ?? null;
}
