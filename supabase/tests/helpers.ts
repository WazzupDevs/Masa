// Shared flows for integration tests: onboarding and check-in at fixture venues.
import { expect } from 'vitest';

import {
  CURRENT_KVKK_VERSION,
  CURRENT_LOCATION_CONSENT_VERSION,
  CURRENT_TERMS_VERSION,
} from '../functions/_shared/pure/consent.ts';
import { ANCHOR, FIXTURE_VENUES, offset } from './fixtures/venues.ts';
import { type Client, invoke, signIn, sql } from './local.ts';

export const PHONES = ['+905550000001', '+905550000002', '+905550000003'] as const;

export async function onboarded(phone: string): Promise<Client> {
  const client = await signIn(phone);
  const res = await invoke(client, 'account', {
    action: 'complete-onboarding',
    ageConfirmed: true,
    termsVersion: CURRENT_TERMS_VERSION,
    kvkkVersion: CURRENT_KVKK_VERSION,
  });
  expect(res.status).toBe(200);
  return client;
}

// Checks in standing right at the fixture venue.
export async function checkInAt(
  client: Client,
  venues: Record<string, string>,
  key: string,
  headcount = 3,
  participation?: 'anonymous' | 'profile',
): Promise<{ sessionId: string; alias: string }> {
  const fixture = FIXTURE_VENUES.find((v) => v.key === key);
  const id = venues[key];
  if (!fixture || !id) throw new Error(`unknown fixture venue ${key}`);
  const here = offset(ANCHOR, fixture.distanceM, fixture.bearingDeg);
  const res = await invoke(client, 'checkin', {
    action: 'check-in',
    venueId: id,
    lat: here.lat,
    lng: here.lng,
    accuracyM: 10,
    headcount,
    locationConsentVersion: CURRENT_LOCATION_CONSENT_VERSION,
    ...(participation ? { participation } : {}),
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as { sessionId: string; alias: string };
}

export function errorBody(code: string) {
  return { error: { code, message: expect.any(String) } };
}

// Resolves when the event arrives on the channel, rejects after the timeout.
export function waitForBroadcast(
  client: Client,
  topic: string,
  event: string,
  timeoutMs = 8000,
): { subscribed: Promise<void>; received: Promise<void>; close: () => Promise<void> } {
  const channel = client.channel(topic, { config: { private: true } });
  let resolveReceived: () => void = () => {};
  const received = new Promise<void>((resolve, reject) => {
    resolveReceived = resolve;
    setTimeout(() => reject(new Error(`no ${event} on ${topic}`)), timeoutMs);
  });
  const subscribed = new Promise<void>((resolve, reject) => {
    channel
      .on('broadcast', { event }, () => resolveReceived())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
      });
  });
  return { subscribed, received, close: async () => void (await client.removeChannel(channel)) };
}

// Waits until another connection's statement running `fn` waits on a lock (tests of lock order).
export async function waitUntilBlocked(fn: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    const [row] = await sql`
      select count(*)::int as n from pg_stat_activity
      where wait_event_type = 'Lock' and query like ${`%${fn}%`} and pid <> pg_backend_pid()
    `;
    if ((row?.n ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${fn} never waited on a lock`);
}
