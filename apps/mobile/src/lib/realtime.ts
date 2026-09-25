import { createChannelRegistry, type OpenChannel } from '@shared/realtimeChannels.ts';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect, useRef } from 'react';

import { supabase } from '@/lib/supabase';

// Every Realtime subscription of the app goes through this registry: one private channel per
// topic, shared by all mounted consumers (see @shared/realtimeChannels.ts for why).
const registry = createChannelRegistry<RealtimeChannel>(supabase);

export type { OpenChannel };

// Subscribes while mounted and `topic` is set. `open` builds the channel on first use of the
// topic; `onEvent` always sees the latest render's handler, so it never causes a resubscribe.
export function useChannel<E>(
  topic: string | null,
  open: OpenChannel<RealtimeChannel, E>,
  onEvent: (event: E) => void,
): void {
  const handler = useRef(onEvent);
  const opener = useRef(open);
  useEffect(() => {
    handler.current = onEvent;
    opener.current = open;
  });

  useEffect(() => {
    if (!topic) return;
    return registry.acquire<E>(
      topic,
      (emit) => opener.current(emit),
      (event) => handler.current(event),
    );
  }, [topic]);
}

// A private channel for `topic`; all app channels are private (realtime.messages policies).
export function privateChannel(topic: string, presenceKey?: string): RealtimeChannel {
  return supabase.channel(topic, {
    config: { private: true, ...(presenceKey ? { presence: { key: presenceKey } } : {}) },
  });
}
