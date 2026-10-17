import { CONCEPTS, type Concept } from './rooms.ts';

// The table card at the top of the venue screen, the home screen (docs/SPEC_V3.md §23.C; canvas:
// Aşama 2 · Ekranlar → Faz 3 · 23.1 Masa ve lobi). The server's rooms stay; the user only sees the
// table:
// - 'off': not in the lobby ("Masanı lobiye aç", "Masanla oyna");
// - 'open': in the lobby as the leader of its waiting room ("Lobiden çek", "Masaya git");
// - 'member': a phone on that waiting room's side ("Masaya git", "Masadan çık");
// - 'merged': two sides ("Masaya git");
// - 'solo': "Masanla oyna" ("Masaya git").
export type TableState = 'off' | 'open' | 'member' | 'merged' | 'solo';

export type TableRoom = {
  status: string;
  visibility: string;
};

// `leader`: this phone leads a side of the room (its session is the room's owner or guest). Since
// step 23.3 a two-sided room closes at once (§23.G): a room that is neither waiting nor active
// does not hold the table.
export function tableState(room: TableRoom | null, leader: boolean): TableState {
  if (!room || (room.status !== 'waiting' && room.status !== 'active')) return 'off';
  if (room.visibility === 'private') return 'solo';
  if (room.status === 'waiting') return leader ? 'open' : 'member';
  return 'merged';
}

// What the lobby offers the table in each state (docs/SPEC_V3.md §23.C, the 23.1 PR's limits):
// "Katıl" also from its own waiting room, as its leader; "Bu masadayım" and opening to the lobby
// only without a room. A merged table, a "Masanla oyna" table and a member see the lobby without
// its buttons.
export function lobbyActions(state: TableState): { join: boolean; member: boolean } {
  return { join: state === 'off' || state === 'open', member: state === 'off' };
}

// A lobby row's game tag as read (`venue_lobby_tags`); anything else is "fark etmez".
export function gameTag(value: unknown): Concept | null {
  return (CONCEPTS as readonly unknown[]).includes(value) ? (value as Concept) : null;
}

// A "Kabul" the server can no longer carry out (docs/SPEC_V3.md §23.C): the requester's table
// merged with another table while its request waited (room_not_available), or the request ended.
// The leader's card then says the table is no longer available instead of an error, and closes.
export function requestGone(code: string): boolean {
  return (
    code === 'room_not_available' || code === 'request_expired' || code === 'request_not_found'
  );
}
