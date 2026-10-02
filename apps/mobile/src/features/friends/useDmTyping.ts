import { shouldSendTyping, TYPING } from '@shared/dmInbox.ts';
import { dmTypingChannel, TYPING_EVENT } from '@shared/rooms.ts';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';

import { privateChannel, useChannel } from '@/lib/realtime';

// "yazıyor" in a DM (docs/SPEC_V3.md §18.2, §18.3): dm_typing:{thread_id} is the one channel the
// app sends on itself; only the two members may join (realtime.messages policies). The event
// carries an empty payload that is never read, and nothing is stored. The own sends are not echoed
// back (broadcast `self` is off by default).
export function useDmTyping(threadId: string) {
  const topic = dmTypingChannel(threadId);
  const joined = useRef<RealtimeChannel | null>(null);
  const lastSent = useRef<number | null>(null);
  const [typingUntil, setTypingUntil] = useState<number | null>(null);

  useChannel<'typing'>(
    topic,
    (emit) => ({
      channel: privateChannel(topic).on('broadcast', { event: TYPING_EVENT }, () => emit('typing')),
      onStatus: (status, channel) => {
        joined.current = status === 'SUBSCRIBED' ? channel : null;
      },
    }),
    () => setTypingUntil(Date.now() + TYPING.showMs),
  );

  // The dots go SHOW_MS after the last event.
  useEffect(() => {
    if (typingUntil === null) return undefined;
    const timer = setTimeout(() => setTypingUntil(null), Math.max(0, typingUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [typingUntil]);

  // The composer's text changed: at most one event every SEND_MS.
  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (!shouldSendTyping(lastSent.current, now)) return;
    lastSent.current = now;
    void joined.current?.send({ type: 'broadcast', event: TYPING_EVENT, payload: {} });
  }, []);

  // A message from the other side arrived: the dots go at once.
  const clearTyping = useCallback(() => setTypingUntil(null), []);

  return { typing: typingUntil !== null, notifyTyping, clearTyping };
}
