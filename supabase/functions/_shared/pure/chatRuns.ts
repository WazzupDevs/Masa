// Chat messages grouped for display (canvas: Aşama 4 · Yenileme): a run is consecutive messages
// from one sender within RUN_GAP_MS; the name goes over its first message, the time under its last.
// A day line goes before the first message of each local day.
export const RUN_GAP_MS = 5 * 60_000;

export type RunItem<T> = {
  item: T;
  first: boolean;
  last: boolean;
  // The local day's start when this message opens a day, else null.
  day: Date | null;
};

export function toRuns<T>(
  items: readonly T[],
  sender: (item: T) => string,
  at: (item: T) => string,
): RunItem<T>[] {
  const out: RunItem<T>[] = [];
  let prevDay = '';
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as T;
    const prev = i > 0 ? (items[i - 1] as T) : null;
    const next = i + 1 < items.length ? (items[i + 1] as T) : null;
    const t = Date.parse(at(item));
    const d = new Date(t);
    const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const newDay = dayKey !== prevDay;
    prevDay = dayKey;
    const joinsPrev =
      !newDay &&
      prev !== null &&
      sender(prev) === sender(item) &&
      t - Date.parse(at(prev)) <= RUN_GAP_MS;
    const joinsNext =
      next !== null &&
      sender(next) === sender(item) &&
      Date.parse(at(next)) - t <= RUN_GAP_MS &&
      sameDay(d, new Date(Date.parse(at(next))));
    out.push({
      item,
      first: !joinsPrev,
      last: !joinsNext,
      day: newDay ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null,
    });
  }
  return out;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
