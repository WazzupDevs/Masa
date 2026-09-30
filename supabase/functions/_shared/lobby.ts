import type { Db } from './auth.ts';
import { inBackground } from './background.ts';
import { broadcast } from './broadcast.ts';
import { dbError } from './db.ts';
import { BROADCAST, venueChannel } from './pure/rooms.ts';

// Announces a lobby change, except for a room still held out of the lobby after its owner's
// reveal window (MVP_SPEC §4.6): the venue channel must not tell that the other table went on.
// "Odayı bitir" and blocking both go through here, so they broadcast alike (rule 5).
export function lobbyChanged(db: Db, room: { id: string; venue_id: string }): void {
  inBackground(
    (async () => {
      const held = await db.rpc('rooms_lobby_held', { target_room_id: room.id });
      if (held.error) throw dbError('rooms_lobby_held', held.error);
      if (!held.data) await broadcast(venueChannel(room.venue_id), BROADCAST.lobbyChanged);
    })(),
  );
}
