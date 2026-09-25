// Keşfet (docs/SPEC_V2.md §4): buckets instead of counts, refreshed only by cron, and planned
// events within the window.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  ACTIVITY_REFRESH_MINUTES,
  ACTIVITY_THRESHOLDS,
  EVENT_WINDOW_DAYS,
} from '../functions/_shared/pure/explore.ts';
import { deleteFixtureVenues, insertFixtureVenues } from './fixtures/venues.ts';
import { onboarded, PHONES } from './helpers.ts';
import { type Client, deleteUserByPhone, sql } from './local.ts';

let venue: Record<string, string> = {};
let viewer: Client;
const extraUsers: string[] = [];

beforeAll(async () => {
  await deleteFixtureVenues(sql);
  venue = await insertFixtureVenues(sql);
  viewer = await onboarded(PHONES[0]);
});

afterEach(async () => {
  if (extraUsers.length > 0) {
    await sql`delete from auth.users where id = any(${extraUsers})`;
    extraUsers.length = 0;
  }
  await sql`delete from public.venue_events`;
});

afterAll(async () => {
  for (const phone of PHONES) await deleteUserByPhone(phone);
  await deleteFixtureVenues(sql);
  await sql.end();
});

// `n` more active tables at the venue, each with its own bare account.
async function addActiveTables(venueId: string, n: number) {
  for (let i = 0; i < n; i++) {
    const [user] =
      await sql`insert into auth.users (id, aud, role) values (gen_random_uuid(), 'authenticated', 'authenticated') returning id`;
    const userId = user?.id as string;
    extraUsers.push(userId);
    await sql`
      insert into public.table_sessions (user_id, venue_id, alias, headcount, expires_at)
      values (${userId}, ${venueId}, ${`Test Masa ${extraUsers.length}`}, 2, now() + interval '1 hour')
    `;
  }
}

const refresh = () =>
  sql`select private.refresh_venue_activity(${ACTIVITY_THRESHOLDS.calmMax}, ${ACTIVITY_THRESHOLDS.livelyMax})`;

async function explore() {
  const { data, error } = await viewer.rpc('explore_venues', { event_days: EVENT_WINDOW_DAYS });
  expect(error).toBeNull();
  return data ?? [];
}

async function bucketOf(venueId: string) {
  return (await explore()).find((v) => v.venue_id === venueId)?.bucket;
}

describe('explore_venues', () => {
  it('shows 1 and 2 tables as calm, 3 as lively and 6 as buzzing', async () => {
    const id = venue['at-anchor'] ?? '';
    const seen: (string | undefined)[] = [];
    for (const total of [1, 2, 3, 6]) {
      await addActiveTables(id, total - extraUsers.length);
      await refresh();
      seen.push(await bucketOf(id));
    }
    expect(seen).toEqual(['calm', 'calm', 'lively', 'buzzing']);
  });

  it('never returns a count, only the bucket', async () => {
    await addActiveTables(venue['at-anchor'] ?? '', 4);
    await refresh();
    const row = (await explore()).find((v) => v.venue_id === venue['at-anchor']);
    expect(Object.keys(row ?? {}).sort()).toEqual(
      [
        'bucket',
        'district',
        'event_ends_at',
        'event_starts_at',
        'event_title',
        'lat',
        'lng',
        'name',
        'venue_id',
      ].sort(),
    );
    expect(Object.values(row ?? {})).not.toContain(4);
  });

  it('changes only when the cron job refreshes', async () => {
    const id = venue['at-anchor'] ?? '';
    await refresh();
    const before = await bucketOf(id);
    await addActiveTables(id, 6);
    expect(await bucketOf(id)).toBe(before);
    await refresh();
    expect(await bucketOf(id)).toBe('buzzing');
  });

  it('runs the cron job every 5 minutes with the thresholds of pure/explore.ts', async () => {
    const [job] =
      await sql`select schedule, command from cron.job where jobname = 'refresh-venue-activity'`;
    expect(job?.schedule).toBe(`*/${ACTIVITY_REFRESH_MINUTES} * * * *`);
    expect(job?.command).toBe(
      `select private.refresh_venue_activity(${ACTIVITY_THRESHOLDS.calmMax}, ${ACTIVITY_THRESHOLDS.livelyMax})`,
    );
  });

  it('keeps activity and events out of client reads', async () => {
    expect((await viewer.from('venue_activity').select('*')).error?.code).toBe('42501');
    expect((await viewer.from('venue_events').select('*')).error?.code).toBe('42501');
  });
});

describe('planned events', () => {
  async function addEvent(venueId: string, title: string, startsIn: string, lasts = '3 hours') {
    await sql`
      insert into public.venue_events (venue_id, title, starts_at, ends_at)
      values (${venueId}, ${title}, now() + ${startsIn}::interval, now() + ${startsIn}::interval + ${lasts}::interval)
    `;
  }

  async function eventOf(venueId: string) {
    const row = (await explore()).find((v) => v.venue_id === venueId);
    return row?.event_title ?? null;
  }

  it('shows a running event, else the next one within 7 days', async () => {
    const id = venue['at-anchor'] ?? '';
    await addEvent(id, 'Bitti', '-5 hours');
    await addEvent(id, 'Salı Masa gecesi', '3 days');
    expect(await eventOf(id)).toBe('Salı Masa gecesi');
    await addEvent(id, 'Şimdi Tabu', '-1 hour');
    expect(await eventOf(id)).toBe('Şimdi Tabu');
  });

  it('hides events further than 7 days and ended ones', async () => {
    const id = venue['at-anchor'] ?? '';
    await addEvent(id, 'Çok ileride', '8 days');
    await addEvent(id, 'Geçmiş', '-10 hours');
    expect(await eventOf(id)).toBeNull();
  });
});
