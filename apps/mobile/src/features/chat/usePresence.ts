import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

type Role = 'owner' | 'guest';

// Realtime presence in the room: tells whether the other table is still connected
// (MVP_SPEC §9 Realtime). The channel is private: only the room's two tables may join or track
// (realtime.messages policies). Presence keys are the roles, not session ids.
export function useOtherTableOnline(roomId: string, role: Role, hasOtherTable: boolean): boolean {
  const [online, setOnline] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const channel = supabase.channel(`presence:${roomId}`, {
      config: { private: true, presence: { key: role } },
    });
    channel
      .on('presence', { event: 'sync' }, () =>
        setOnline(new Set(Object.keys(channel.presenceState()))),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({});
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, role]);

  return !hasOtherTable || online.has(role === 'owner' ? 'guest' : 'owner');
}
