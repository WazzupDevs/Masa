import { describe, expect, it } from 'vitest';

import { markdownTable, summarize } from './stats.ts';

describe('summarize', () => {
  it('keeps the first sample apart and uses nearest-rank percentiles', () => {
    expect(summarize([900, 100, 300, 200, 400, 500, 600, 700, 800, 1000])).toEqual({
      n: 10,
      first: 900,
      min: 100,
      median: 500,
      p90: 900,
      max: 1000,
    });
    expect(summarize([42])).toEqual({ n: 1, first: 42, min: 42, median: 42, p90: 42, max: 42 });
    expect(summarize([])).toBeNull();
  });
});

describe('markdownTable', () => {
  it('writes one row per step, rounded to milliseconds, and "yok" without samples', () => {
    expect(
      markdownTable([
        { step: 'dm/send', samples: [120.4, 80.6] },
        { step: 'venue-chat/page', samples: [] },
      ]),
    ).toBe(
      [
        '| Adım | n | İlk | Min | Medyan | p90 | Maks |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
        '| dm/send | 2 | 120 | 81 | 81 | 120 | 120 |',
        '| venue-chat/page | 0 | yok | yok | yok | yok | yok |',
      ].join('\n'),
    );
  });
});
