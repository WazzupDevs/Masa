import { useEffect, useRef } from 'react';

import { supabase } from '@/lib/supabase';

// Listens to a data-free broadcast; the handler refetches through RLS.
export function useBroadcast(topic: string | null, event: string, onEvent: () => void): void {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!topic) return;
    const channel = supabase
      .channel(topic)
      .on('broadcast', { event }, () => handler.current())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [topic, event]);
}
