// Sohbet cards (MVP_SPEC §5.3).
export const SOHBET_THEMES = ['isinma', 'film-dizi-muzik', 'hic-yaptin-mi', 'derin'] as const;
export type SohbetTheme = (typeof SOHBET_THEMES)[number];

// Either table may ask for the next card, at most once every 5 seconds per room.
export const SOHBET_NEXT_COOLDOWN_MS = 5000;

export type SohbetState = {
  concept: 'sohbet';
  cardId: string;
  theme: SohbetTheme;
  prompt: string;
  nextAllowedAt: string;
};
