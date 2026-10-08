import {
  myReaction,
  nextReaction,
  type Quote,
  type ReactionCount,
  withMyReaction,
} from '@shared/messageExtras.ts';
import { isReaction, type Reaction } from '@shared/reactions.ts';
import { useCallback, useState } from 'react';

import type { ChatQuote } from '@/components/ChatBubble';
import { tr } from '@/i18n/tr';

// Replies and reactions (docs/SPEC_V3.md §21), the same in the DM, the room chat and the venue
// chat.

// The quote inside a bubble: the reader's own message is "Sen"; one that is gone says only so.
// `otherName` labels the other side when the quote carries no name (the DM).
export function toChatQuote(quote: Quote | null, otherName?: string): ChatQuote | undefined {
  if (!quote) return undefined;
  if (quote.gone) return { name: tr.chat.quoteGone, text: '' };
  return { name: quote.fromMe ? tr.chat.you : (quote.name ?? otherName ?? ''), text: quote.body };
}

// The message being answered, over the message bar.
export type ReplyTarget = { id: string; quote: ChatQuote };

export function useReplyTarget() {
  const [target, setTarget] = useState<ReplyTarget | null>(null);
  const clear = useCallback(() => setTarget(null), []);
  return { target, setTarget, clear };
}

// The reader's reaction shows at once and stays until the page comes back from the server; a
// failed one (the venue chat's limit included) quietly goes back to what the page says. `alias` is
// the reader's table in the room chat, so its name moves with the reaction.
export function useReactions(
  send: (messageId: string, emoji: Reaction | null) => Promise<unknown>,
  refresh: () => Promise<unknown>,
  alias?: string,
) {
  const [pending, setPending] = useState<Record<string, Reaction | null>>({});
  const view = useCallback(
    (messageId: string, list: ReactionCount[]): ReactionCount[] =>
      messageId in pending ? withMyReaction(list, pending[messageId] ?? null, alias) : list,
    [pending, alias],
  );
  const pick = (messageId: string, list: ReactionCount[], emoji: string) => {
    if (!isReaction(emoji)) return;
    const next = nextReaction(myReaction(view(messageId, list)), emoji);
    setPending((p) => ({ ...p, [messageId]: next }));
    void send(messageId, next)
      .then(refresh, () => undefined)
      .finally(() =>
        setPending((p) => {
          const rest = { ...p };
          delete rest[messageId];
          return rest;
        }),
      );
  };
  return { view, pick };
}
