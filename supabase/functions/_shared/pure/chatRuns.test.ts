import { describe, expect, it } from 'vitest';

import { RUN_GAP_MS, toRuns } from './chatRuns.ts';

type M = { from: string; at: string };
const at = (h: number, m: number, day = 1) => new Date(2026, 9, day, h, m).toISOString();
const runs = (ms: M[]) =>
  toRuns(
    ms,
    (m) => m.from,
    (m) => m.at,
  ).map((r) => [r.first, r.last, r.day !== null]);

describe('toRuns', () => {
  it('groups one sender’s messages within the gap', () => {
    expect(
      runs([
        { from: 'a', at: at(10, 0) },
        { from: 'a', at: at(10, 1) },
        { from: 'b', at: at(10, 2) },
      ]),
    ).toEqual([
      [true, false, true],
      [false, true, false],
      [true, true, false],
    ]);
  });

  it('starts a new run after the gap', () => {
    const gapMin = RUN_GAP_MS / 60_000 + 1;
    expect(
      runs([
        { from: 'a', at: at(10, 0) },
        { from: 'a', at: at(10, gapMin) },
      ]),
    ).toEqual([
      [true, true, true],
      [true, true, false],
    ]);
  });

  it('starts a new run and a day line on a new day', () => {
    expect(
      runs([
        { from: 'a', at: at(23, 59, 1) },
        { from: 'a', at: at(0, 1, 2) },
      ]),
    ).toEqual([
      [true, true, true],
      [true, true, true],
    ]);
  });

  it('handles an empty list', () => {
    expect(runs([])).toEqual([]);
  });
});
