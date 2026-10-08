// Shared flows for integration tests: onboarding and check-in at fixture venues.
import { expect } from 'vitest';

import { ageOn, istanbulToday } from '../functions/_shared/pure/age.ts';
import type { ProfileUploadUrl } from '../functions/_shared/pure/api/profile.ts';
import {
  CURRENT_KVKK_VERSION,
  CURRENT_LOCATION_CONSENT_VERSION,
  CURRENT_TERMS_VERSION,
} from '../functions/_shared/pure/consent.ts';
import { PHOTO_BUCKET } from '../functions/_shared/pure/profile.ts';
import { ANCHOR, FIXTURE_VENUES, offset } from './fixtures/venues.ts';
import { type Client, invoke, signIn, sql } from './local.ts';

export const PHONES = ['+905550000001', '+905550000002', '+905550000003'] as const;

// Sign-up = profile (docs/SPEC_V3.md §3): consents, a display name and an adult birth date.
export const TEST_DISPLAY_NAME = 'Test Masa';
export const TEST_BIRTH_DATE = '2000-01-15';
export const TEST_AGE = ageOn({ year: 2000, month: 1, day: 15 }, istanbulToday(new Date()));

export async function onboarded(
  phone: string,
  profile: { displayName?: string; birthDate?: string } = {},
): Promise<Client> {
  const client = await signIn(phone);
  const res = await invoke(client, 'account', {
    action: 'complete-onboarding',
    termsVersion: CURRENT_TERMS_VERSION,
    kvkkVersion: CURRENT_KVKK_VERSION,
    displayName: profile.displayName ?? TEST_DISPLAY_NAME,
    birthDate: profile.birthDate ?? TEST_BIRTH_DATE,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return client;
}

// An account from before v3 had no display name; the v2 display_name_required paths still guard
// against it. Only the database can make one now.
export async function clearDisplayName(client: Client): Promise<void> {
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error('not signed in');
  await sql`update public.profiles set display_name = null where id = ${data.user.id}`;
}

// Checks in standing right at the fixture venue.
export async function checkInAt(
  client: Client,
  venues: Record<string, string>,
  key: string,
  headcount = 3,
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
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as { sessionId: string; alias: string };
}

// A profile photo through the app's own path (upload URL, then commit): a minimal JPEG without
// metadata. Returns the stored path.
const TEST_JPEG = new Uint8Array([
  0xff,
  0xd8,
  0xff,
  0xdb,
  0x00,
  0x43,
  0x00,
  ...Array.from({ length: 64 }, (_, i) => (i % 50) + 1),
  0xff,
  0xda,
  0x00,
  0x08,
  0x01,
  0x01,
  0x00,
  0x00,
  0x3f,
  0x00,
  0x12,
  0xff,
  0x00,
  0x34,
  0x56,
  0xff,
  0xd9,
]);

export async function setTestPhoto(client: Client): Promise<string> {
  const res = await invoke(client, 'profile', { action: 'photo-upload-url' });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const { path, token } = res.body as ProfileUploadUrl;
  const { error } = await client.storage
    .from(PHOTO_BUCKET)
    .uploadToSignedUrl(path, token, TEST_JPEG, { contentType: 'image/jpeg' });
  expect(error).toBeNull();
  const commit = await invoke(client, 'profile', { action: 'photo-commit', path });
  expect(commit, JSON.stringify(commit.body)).toEqual({ status: 200, body: { ok: true } });
  return path;
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
