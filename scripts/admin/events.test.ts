import { describe, expect, it } from 'vitest';

import { parseEventCommand, parseEventTime } from './events.ts';

describe('parseEventTime', () => {
  it('reads Istanbul local times and ISO times with an offset', () => {
    expect(parseEventTime('2026-09-29 20:00')).toBe('2026-09-29T17:00:00.000Z');
    expect(parseEventTime('2026-09-29T20:00')).toBe('2026-09-29T17:00:00.000Z');
    expect(parseEventTime('2026-09-29T20:00+03:00')).toBe('2026-09-29T17:00:00.000Z');
    expect(parseEventTime('2026-09-29T17:00:00Z')).toBe('2026-09-29T17:00:00.000Z');
  });

  it('rejects ambiguous and invalid times', () => {
    expect(parseEventTime('2026-09-29T20:00:00')).toBeNull();
    expect(parseEventTime('salı 20.00')).toBeNull();
  });
});

describe('parseEventCommand', () => {
  it('adds with a default length of 3 hours', () => {
    expect(
      parseEventCommand(['add', 'test/hush-coffee', ' Masa gecesi ', '2026-09-29 20:00']),
    ).toEqual({
      kind: 'add',
      venue: 'test/hush-coffee',
      title: 'Masa gecesi',
      startsAt: '2026-09-29T17:00:00.000Z',
      endsAt: '2026-09-29T20:00:00.000Z',
    });
  });

  it('takes an explicit end and rejects one before the start', () => {
    const cmd = parseEventCommand([
      'add',
      'node/1',
      'Tabu',
      '2026-09-29 20:00',
      '2026-09-29 23:30',
    ]);
    expect(cmd).toMatchObject({ endsAt: '2026-09-29T20:30:00.000Z' });
    expect(() =>
      parseEventCommand(['add', 'node/1', 'Tabu', '2026-09-29 20:00', '2026-09-29 19:00']),
    ).toThrow(/after start/);
  });

  it('limits the title to 60 characters', () => {
    expect(() => parseEventCommand(['add', 'node/1', 'x'.repeat(61), '2026-09-29 20:00'])).toThrow(
      /1–60/,
    );
    expect(() => parseEventCommand(['add', 'node/1', '  ', '2026-09-29 20:00'])).toThrow();
  });

  it('parses list and remove, and shows usage otherwise', () => {
    expect(parseEventCommand(['list'])).toEqual({ kind: 'list' });
    const id = '00000000-0000-4000-8000-000000000001';
    expect(parseEventCommand(['remove', id])).toEqual({ kind: 'remove', eventId: id });
    expect(() => parseEventCommand(['remove', 'not-an-id'])).toThrow(/admin:event/);
    expect(() => parseEventCommand([])).toThrow(/admin:event/);
  });
});
