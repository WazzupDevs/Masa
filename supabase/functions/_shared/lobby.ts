import { inBackground } from './background.ts';
import { broadcast } from './broadcast.ts';
import { BROADCAST, venueChannel } from './pure/rooms.ts';

// Announces a lobby change on the venue channel. "Odayı bitir" and blocking both go through here, so
// they broadcast alike (rule 5). Since step 23.3 no "Tanışalım mı?" window holds a room out of the
// lobby (docs/SPEC_V3.md §23.G), so every change is announced.
export function lobbyChanged(room: { venue_id: string }): void {
  inBackground(broadcast(venueChannel(room.venue_id), BROADCAST.lobbyChanged));
}
