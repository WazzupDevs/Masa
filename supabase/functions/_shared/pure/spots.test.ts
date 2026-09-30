import { describe, expect, it } from 'vitest';

import { groupRoomsBySpot } from './spots.ts';

const room = (id: string, spot: string | null, name: string | null = spot) => ({
  id,
  spot_id: spot,
  spot_name: name,
});

describe('groupRoomsBySpot', () => {
  it("puts the table's spot first, then the others by name, spotless rooms last", () => {
    const groups = groupRoomsBySpot(
      [
        room('1', 'Yemekhane'),
        room('2', null),
        room('3', 'Kantin'),
        room('4', 'Çardak'),
        room('5', 'Kantin'),
      ],
      'Yemekhane',
    );
    expect(groups.map((g) => [g.spotName, g.mine, g.rooms.map((r) => r.id)])).toEqual([
      ['Yemekhane', true, ['1']],
      ['Çardak', false, ['4']],
      ['Kantin', false, ['3', '5']],
      [null, false, ['2']],
    ]);
  });

  it('keeps the order of the rooms within a spot', () => {
    const [group] = groupRoomsBySpot([room('b', 'K'), room('a', 'K')], 'K');
    expect(group?.rooms.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('is one group of its own at a venue without spots', () => {
    expect(groupRoomsBySpot([room('1', null), room('2', null)], null)).toEqual([
      { spotId: null, spotName: null, mine: true, rooms: [room('1', null), room('2', null)] },
    ]);
  });

  it('marks nothing as mine for a table without a spot at a campus', () => {
    const groups = groupRoomsBySpot([room('1', 'Kantin'), room('2', null)], null);
    expect(groups.map((g) => [g.spotName, g.mine])).toEqual([
      [null, true],
      ['Kantin', false],
    ]);
  });

  it('is empty without rooms', () => {
    expect(groupRoomsBySpot([], 'Kantin')).toEqual([]);
  });
});
