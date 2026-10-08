// Message reactions (canvas: Aşama 8 · Saha → Sohbet): six fixed emojis, the same in the DM, the
// room chat and the venue chat. The app shows them on a long press; the server accepts only these.
export const REACTIONS = ['👍', '❤️', '😂', '😮', '🎉', '🔥'] as const;
export type Reaction = (typeof REACTIONS)[number];

export function isReaction(value: unknown): value is Reaction {
  return (REACTIONS as readonly unknown[]).includes(value);
}
