import { useState } from 'react';

import { privateChannel, useChannel } from '@/lib/realtime';

type Role = 'owner' | 'guest';

// Realtime presence in the room: tells whether the other table is still connected
// (MVP_SPEC §9 Realtime). The channel is private: only the room's two tables may join or track
// (realtime.messages policies). Presence keys are the roles, not session ids.
export function useOtherTableOnline(roomId: string, role: Role, hasOtherTable: boolean): boolean {
  const [online, setOnline] = useState<Set<string>>(() => new Set());

  useChannel<string[]>(
    `presence:${roomId}`,
    (emit) => {
      const channel = privateChannel(`presence:${roomId}`, role);
      channel.on('presence', { event: 'sync' }, () => emit(Object.keys(channel.presenceState())));
      return {
        channel,
        onStatus: (status, subscribed) => {
          if (status === 'SUBSCRIBED') void subscribed.track({});
        },
      };
    },
    (keys) => setOnline(new Set(keys)),
  );

  return !hasOtherTable || online.has(role === 'owner' ? 'guest' : 'owner');
}
