// Numbers for the latency measurement (measure.ts): each step's samples in milliseconds, summed
// up as a Markdown table.

export type Summary = {
  n: number;
  first: number;
  min: number;
  median: number;
  p90: number;
  max: number;
};

// Nearest-rank percentile of a non-empty sample.
function percentile(sorted: readonly number[], p: number): number {
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1] ?? Number.NaN;
}

// `first` is the first sample as taken (often a cold start); the rest over all samples.
export function summarize(samples: readonly number[]): Summary | null {
  const first = samples[0];
  if (first === undefined) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: samples.length,
    first,
    min: sorted[0] ?? first,
    median: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    max: sorted[sorted.length - 1] ?? first,
  };
}

const ms = (value: number) => `${Math.round(value)}`;

// One row per step, in the order given; a step without samples shows "yok".
export function markdownTable(
  rows: readonly { step: string; samples: readonly number[] }[],
): string {
  const lines = [
    '| Adım | n | İlk | Min | Medyan | p90 | Maks |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const { step, samples } of rows) {
    const s = summarize(samples);
    lines.push(
      s
        ? `| ${step} | ${s.n} | ${ms(s.first)} | ${ms(s.min)} | ${ms(s.median)} | ${ms(s.p90)} | ${ms(s.max)} |`
        : `| ${step} | 0 | yok | yok | yok | yok | yok |`,
    );
  }
  return lines.join('\n');
}
