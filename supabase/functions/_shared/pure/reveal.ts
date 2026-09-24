// End of a two-table room (MVP_SPEC §4.6): 30 seconds to answer "Tanışalım mı?"; on a mutual
// yes both screens show the same color and emoji for 60 seconds.
export const REVEAL = { decisionSeconds: 30, signalSeconds: 60 } as const;

// Bright, distinct full-screen colors, easy to spot across a room.
export const REVEAL_COLORS = [
  '#E63946',
  '#F4A261',
  '#E9C46A',
  '#2A9D8F',
  '#457B9D',
  '#8E44AD',
  '#FF6FB5',
  '#06D6A0',
] as const;

export const REVEAL_EMOJIS = ['🦊', '🐙', '🌻', '🚀', '🍉', '🎈', '⭐', '🦋', '🍀', '🎸'] as const;

export type RevealToken = { color: string; emoji: string };

export function pickRevealToken(random: () => number): RevealToken {
  const pick = <T>(list: readonly T[]): T =>
    list[Math.min(Math.floor(random() * list.length), list.length - 1)] as T;
  return { color: pick(REVEAL_COLORS), emoji: pick(REVEAL_EMOJIS) };
}

export function isRevealToken(value: unknown): value is RevealToken {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.color === 'string' && typeof v.emoji === 'string';
}

export type RevealResult = 'mutual' | 'none';
