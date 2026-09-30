// Lobby rooms grouped by spot (docs/SPEC_V3.md §4.3): the table's own spot first, then the other
// spots by name, rooms without a spot (tables from before the campus) last. Only open rooms are
// grouped: there is no count of tables per spot anywhere.

export type SpotRoom = { spot_id: string | null; spot_name: string | null };

export type SpotGroup<T extends SpotRoom> = {
  spotId: string | null;
  spotName: string | null;
  // The table's own spot: its rooms can be asked to join; the others need "Bu noktadayım".
  mine: boolean;
  rooms: T[];
};

export function groupRoomsBySpot<T extends SpotRoom>(
  rooms: readonly T[],
  mySpotId: string | null,
): SpotGroup<T>[] {
  const groups = new Map<string | null, SpotGroup<T>>();
  for (const room of rooms) {
    const group = groups.get(room.spot_id) ?? {
      spotId: room.spot_id,
      spotName: room.spot_name,
      mine: room.spot_id === mySpotId,
      rooms: [],
    };
    group.rooms.push(room);
    groups.set(room.spot_id, group);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.mine !== b.mine) return a.mine ? -1 : 1;
    if ((a.spotId === null) !== (b.spotId === null)) return a.spotId === null ? 1 : -1;
    return (a.spotName ?? '').localeCompare(b.spotName ?? '', 'tr');
  });
}
