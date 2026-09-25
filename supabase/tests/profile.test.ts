// Profiles, participation and photos (docs/SPEC_V2.md §5, §11).
import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ProfileUploadUrl, ProfileView } from '../functions/_shared/pure/api/profile.ts';
import { PHOTO_BUCKET } from '../functions/_shared/pure/profile.ts';
import { removeProfilePhoto } from '../../scripts/admin/photos.ts';
import { banUser } from '../../scripts/admin/ban.ts';
import { deleteFixtureVenues, insertFixtureVenues } from './fixtures/venues.ts';
import { checkInAt, errorBody, onboarded, PHONES } from './helpers.ts';
import {
  admin,
  anonKey,
  apiUrl,
  type Client,
  deleteUserByPhone,
  invoke,
  sql,
  userIdOf,
} from './local.ts';

let venue: Record<string, string> = {};
const V = 'at-anchor';

beforeAll(async () => {
  await deleteFixtureVenues(sql);
  venue = await insertFixtureVenues(sql);
});

afterEach(async () => {
  const folders = await sql<{ public_id: string }[]>`
    select p.public_id from public.profiles p join auth.users u on u.id = p.id
    where u.phone in ${sql(PHONES.map((p) => p.replace(/\D/g, '')))}
  `;
  for (const { public_id } of folders) {
    const { data } = await admin.storage.from(PHOTO_BUCKET).list(public_id);
    if (data?.length) {
      await admin.storage.from(PHOTO_BUCKET).remove(data.map((f) => `${public_id}/${f.name}`));
    }
  }
  for (const phone of PHONES) await deleteUserByPhone(phone);
  await sql`delete from public.reports where target_type = 'profile'`;
  await sql`truncate public.banned_phones`;
});

afterAll(async () => {
  await deleteFixtureVenues(sql);
  await sql.end();
});

const profile = (client: Client, body: Record<string, unknown>) => invoke(client, 'profile', body);

async function publicIdOf(client: Client): Promise<string> {
  const { data, error } = await client.from('profiles').select('public_id').single();
  expect(error).toBeNull();
  return data?.public_id ?? '';
}

async function named(phone: string, name: string): Promise<Client> {
  const client = await onboarded(phone);
  expect(await profile(client, { action: 'update', displayName: name })).toEqual({
    status: 200,
    body: { ok: true },
  });
  return client;
}

// Owner and guest in an open room at the fixture venue, each with the given participation.
async function room(
  owner: Client,
  guest: Client,
  ownerMode: 'anonymous' | 'profile',
  guestMode: 'anonymous' | 'profile',
): Promise<string> {
  await checkInAt(owner, venue, V, 2, ownerMode);
  await checkInAt(guest, venue, V, 3, guestMode);
  const created = await invoke(owner, 'rooms', {
    action: 'create',
    concept: 'sohbet',
    visibility: 'open',
  });
  const roomId = (created.body as { roomId: string }).roomId;
  await join(owner, guest, roomId);
  return roomId;
}

async function join(owner: Client, guest: Client, roomId: string): Promise<void> {
  expect((await invoke(guest, 'rooms', { action: 'request-join', roomId })).status).toBe(200);
  const [request] =
    await sql`select id from public.join_requests where room_id = ${roomId} and status = 'pending'`;
  const res = await invoke(owner, 'rooms', {
    action: 'respond',
    requestId: request?.id,
    accept: true,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

async function memberProfile(client: Client, roomId: string): Promise<string | null> {
  const { data, error } = await client.rpc('room_member_profile', { target_room_id: roomId });
  expect(error).toBeNull();
  return data ? data : null;
}

// Minimal JPEGs (the same builder as the pure module's tests).
function segment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...payload];
}
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const JFIF_APP0 = segment(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const EXIF_APP1 = segment(0xe1, [...ascii('Exif'), 0, 0, ...ascii('GPS 41.0,28.6')]);
const DQT = segment(0xdb, [0, ...Array.from({ length: 64 }, (_, i) => (i % 50) + 1)]);
const SCAN = [...segment(0xda, [1, 1, 0, 0, 63, 0]), 0x12, 0xff, 0x00, 0x34, 0x56];
const jpeg = (...segs: number[][]) =>
  new Uint8Array([0xff, 0xd8, ...segs.flat(), ...SCAN, 0xff, 0xd9]);
const CLEAN = jpeg(JFIF_APP0, DQT);

async function upload(client: Client, bytes: Uint8Array): Promise<string> {
  const res = await profile(client, { action: 'photo-upload-url' });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const { path, token } = res.body as ProfileUploadUrl;
  const { error } = await client.storage
    .from(PHOTO_BUCKET)
    .uploadToSignedUrl(path, token, bytes, { contentType: 'image/jpeg' });
  expect(error).toBeNull();
  return path;
}

async function setPhoto(client: Client, bytes: Uint8Array = CLEAN): Promise<string> {
  const path = await upload(client, bytes);
  expect(await profile(client, { action: 'photo-commit', path })).toEqual({
    status: 200,
    body: { ok: true },
  });
  return path;
}

async function objectExists(path: string): Promise<boolean> {
  const [folder, name] = path.split('/');
  const { data } = await admin.storage.from(PHOTO_BUCKET).list(folder, { search: name });
  return (data ?? []).some((f) => f.name === name);
}

const get = (client: Client, publicId: string) => profile(client, { action: 'get', publicId });

describe('profile/update', () => {
  it('needs a display name before any other profile field', async () => {
    const client = await onboarded(PHONES[0]);
    const required = { status: 409, body: errorBody('display_name_required') };
    expect(await profile(client, { action: 'update', bio: 'Merhaba' })).toEqual(required);
    expect(await profile(client, { action: 'update', defaultParticipation: 'profile' })).toEqual(
      required,
    );
    expect(await profile(client, { action: 'photo-upload-url' })).toEqual(required);
    // Joining a table with the profile, too.
    await expect(checkInAt(client, venue, V, 2, 'profile')).rejects.toThrow();
    const [row] = await sql`
      select display_name, bio, default_participation from public.profiles
      where id = ${await userIdOf(client)}
    `;
    expect(row).toEqual({ display_name: null, bio: null, default_participation: 'anonymous' });
  });

  it('checks length and profanity, trims, and clears an empty bio', async () => {
    const client = await onboarded(PHONES[0]);
    for (const displayName of ['a', ' b ', 'x'.repeat(25), 'amk ben']) {
      expect(await profile(client, { action: 'update', displayName })).toEqual({
        status: 422,
        body: errorBody('display_name_invalid'),
      });
    }
    expect(await profile(client, { action: 'update', displayName: '  Deniz   K. ' })).toEqual({
      status: 200,
      body: { ok: true },
    });
    for (const bio of ['x'.repeat(161), 'selam aq']) {
      expect(await profile(client, { action: 'update', bio })).toEqual({
        status: 422,
        body: errorBody('bio_invalid'),
      });
    }
    await profile(client, { action: 'update', bio: ' Tabu sever. ' });
    const id = await userIdOf(client);
    expect((await sql`select display_name, bio from public.profiles where id = ${id}`)[0]).toEqual({
      display_name: 'Deniz K.',
      bio: 'Tabu sever.',
    });
    await profile(client, { action: 'update', bio: '  ' });
    expect((await sql`select bio from public.profiles where id = ${id}`)[0]).toEqual({ bio: null });
  });

  it('stores the default participation and notification choices', async () => {
    const client = await named(PHONES[0], 'Deniz');
    await profile(client, {
      action: 'update',
      defaultParticipation: 'profile',
      notifyDm: false,
      notifyFriendRequests: false,
    });
    const { data } = await client
      .from('profiles')
      .select('default_participation, notify_dm, notify_friend_requests')
      .single();
    expect(data).toEqual({
      default_participation: 'profile',
      notify_dm: false,
      notify_friend_requests: false,
    });
  });

  it('hides the photo path and hidden flag from the own-row read', async () => {
    const client = await named(PHONES[0], 'Deniz');
    const { error } = await client.from('profiles').select('photo_path').single();
    expect(error).not.toBeNull();
    expect((await client.from('profiles').select('photo_hidden_at').single()).error).not.toBeNull();
  });
});

describe('check-in participation and headcount', () => {
  async function sessionOf(client: Client) {
    const { data } = await client
      .from('table_sessions')
      .select('participation, headcount')
      .eq('status', 'active')
      .single();
    return data;
  }

  it('uses the profile default unless the check-in chooses otherwise', async () => {
    const client = await named(PHONES[0], 'Deniz');
    await checkInAt(client, venue, V, 4);
    expect(await sessionOf(client)).toEqual({ participation: 'anonymous', headcount: 4 });

    await profile(client, { action: 'update', defaultParticipation: 'profile' });
    await checkInAt(client, venue, V, 1);
    expect(await sessionOf(client)).toEqual({ participation: 'profile', headcount: 1 });

    await checkInAt(client, venue, V, 2, 'anonymous');
    expect(await sessionOf(client)).toEqual({ participation: 'anonymous', headcount: 2 });
  });

  it('accepts 1–4 (4 = 4+) and rejects 5', async () => {
    const client = await onboarded(PHONES[0]);
    await expect(checkInAt(client, venue, V, 5)).rejects.toThrow();
    await checkInAt(client, venue, V, 4);
    // New rows cannot hold more than 4 even when written directly.
    await expect(
      sql`update public.table_sessions set headcount = 5 where user_id = ${await userIdOf(client)} and status = 'active'`,
    ).rejects.toThrow(/table_sessions_headcount_check/);
  });
});

describe('profile/get', () => {
  it('answers a stranger, an ex-member, a blocked and a blocking account like an unknown id', async () => {
    const [a, b, c] = await Promise.all([
      named(PHONES[0], 'Ayşe'),
      named(PHONES[1], 'Burak'),
      named(PHONES[2], 'Cem'),
    ]);
    const idA = await publicIdOf(a);
    const idB = await publicIdOf(b);
    const unknown = await get(c, randomUUID());
    expect(unknown).toEqual({ status: 404, body: errorBody('not_found') });

    // Before any room: strangers.
    expect(await get(b, idA)).toEqual(unknown);
    await checkInAt(c, venue, V, 2, 'profile');
    const roomId = await room(a, b, 'profile', 'profile');

    // Room members see each other; the third table at the venue does not.
    expect(await get(b, idA)).toMatchObject({
      status: 200,
      body: { publicId: idA, displayName: 'Ayşe', bio: null, photoUrl: null, badges: [] },
    });
    expect((await get(b, idA)).body).not.toHaveProperty('photoHidden');
    expect((await get(a, idB)).status).toBe(200);
    expect(await get(c, idA)).toEqual(unknown);

    // The owner blocks the guest: nothing either way.
    expect((await invoke(a, 'safety', { action: 'block', roomId })).status).toBe(200);
    expect(await get(a, idB)).toEqual(unknown);
    expect(await get(b, idA)).toEqual(unknown);
  });

  it('ends with the room membership', async () => {
    const [a, b] = await Promise.all([named(PHONES[0], 'Ayşe'), named(PHONES[1], 'Burak')]);
    const idA = await publicIdOf(a);
    const roomId = await room(a, b, 'profile', 'anonymous');
    expect((await get(b, idA)).status).toBe(200);
    // The guest joined anonymously: the owner gets nothing for it.
    expect(await get(a, await publicIdOf(b))).toEqual(await get(a, randomUUID()));

    expect((await invoke(b, 'rooms', { action: 'leave' })).status).toBe(200);
    expect(await get(b, idA)).toEqual(await get(b, randomUUID()));
    expect(await memberProfile(b, roomId)).toBeNull();
  });

  it('returns the own profile with the hidden flag', async () => {
    const a = await named(PHONES[0], 'Ayşe');
    const res = await get(a, await publicIdOf(a));
    expect(res).toEqual({
      status: 200,
      body: {
        publicId: await publicIdOf(a),
        displayName: 'Ayşe',
        bio: null,
        photoUrl: null,
        badges: [],
        photoHidden: false,
      },
    });
  });
});

describe('lobby and room: the "profilli" flag only', () => {
  it('shows the flag without any profile id, in the lobby, the request and the room row', async () => {
    const [a, b, c] = await Promise.all([
      named(PHONES[0], 'Ayşe'),
      named(PHONES[1], 'Burak'),
      named(PHONES[2], 'Cem'),
    ]);
    const ids = await Promise.all([a, b, c].map(publicIdOf));
    await checkInAt(a, venue, V, 2, 'profile');
    await checkInAt(b, venue, V, 3, 'profile');
    await checkInAt(c, venue, V, 4, 'anonymous');
    const created = await invoke(a, 'rooms', {
      action: 'create',
      concept: 'sohbet',
      visibility: 'open',
    });
    const roomId = (created.body as { roomId: string }).roomId;

    const { data: lobby } = await c.rpc('venue_lobby', { target_venue_id: venue[V] ?? '' });
    expect(lobby).toEqual([expect.objectContaining({ room_id: roomId, profiled: true })]);
    expect(Object.keys(lobby?.[0] ?? {}).sort()).toEqual(
      ['alias', 'concept', 'headcount', 'profiled', 'room_id', 'waiting_since'].sort(),
    );

    expect((await invoke(b, 'rooms', { action: 'request-join', roomId })).status).toBe(200);
    const { data: requests } = await a.from('join_requests').select('*').eq('room_id', roomId);
    expect(requests).toEqual([expect.objectContaining({ requester_profiled: true })]);
    const [request] = requests ?? [];
    await invoke(a, 'rooms', { action: 'respond', requestId: request?.id, accept: true });
    const { data: roomRow } = await b.from('rooms').select('*').eq('id', roomId).single();

    const seen = JSON.stringify({ lobby, requests, roomRow });
    for (const id of ids) expect(seen).not.toContain(id);

    // Only the members get the other table's id, and only for a profiled table.
    expect(await memberProfile(b, roomId)).toBe(ids[0]);
    expect(await memberProfile(a, roomId)).toBe(ids[1]);
    expect(await memberProfile(c, roomId)).toBeNull();
  });

  it('gives an anonymous table no profile id', async () => {
    const [a, b] = await Promise.all([named(PHONES[0], 'Ayşe'), named(PHONES[1], 'Burak')]);
    const roomId = await room(a, b, 'anonymous', 'profile');
    expect(await memberProfile(b, roomId)).toBeNull();
    expect(await memberProfile(a, roomId)).toBe(await publicIdOf(b));
    const { data: lobbyRow } = await a
      .from('join_requests')
      .select('requester_profiled')
      .eq('room_id', roomId);
    expect(lobbyRow).toEqual([{ requester_profiled: true }]);
  });
});

describe('profile photos', () => {
  it('accepts a clean JFIF, signs it for viewers, and deletes the previous one', async () => {
    const [a, b] = await Promise.all([named(PHONES[0], 'Ayşe'), named(PHONES[1], 'Burak')]);
    const idA = await publicIdOf(a);
    const first = await setPhoto(a);
    expect(first.startsWith(`${idA}/`)).toBe(true);

    await room(a, b, 'profile', 'anonymous');
    const seen = (await get(b, idA)).body as ProfileView;
    expect(seen.photoUrl).toEqual(expect.any(String));
    // Functions sign with the stack's internal URL (http://kong:8000); the path is what counts.
    const signed = new URL(seen.photoUrl ?? '');
    const fetched = await fetch(`${apiUrl}${signed.pathname}${signed.search}`);
    expect(fetched.status).toBe(200);
    expect(new Uint8Array(await fetched.arrayBuffer())).toEqual(CLEAN);

    const second = await setPhoto(a, jpeg(DQT));
    expect(await objectExists(first)).toBe(false);
    expect(await objectExists(second)).toBe(true);
  });

  it('rejects and deletes files with metadata or that are not JPEG', async () => {
    const a = await named(PHONES[0], 'Ayşe');
    for (const bytes of [
      jpeg(JFIF_APP0, EXIF_APP1, DQT),
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    ]) {
      const path = await upload(a, bytes);
      expect(await profile(a, { action: 'photo-commit', path })).toEqual({
        status: 422,
        body: errorBody('photo_invalid'),
      });
      expect(await objectExists(path)).toBe(false);
    }
    const [row] = await sql`select photo_path from public.profiles where id = ${await userIdOf(a)}`;
    expect(row?.photo_path).toBeNull();
  });

  it('refuses files over 300 KB at upload', async () => {
    const a = await named(PHONES[0], 'Ayşe');
    const res = await profile(a, { action: 'photo-upload-url' });
    const { path, token } = res.body as ProfileUploadUrl;
    const big = new Uint8Array(300 * 1024 + 1);
    big.set(CLEAN);
    const { error } = await a.storage
      .from(PHOTO_BUCKET)
      .uploadToSignedUrl(path, token, big, { contentType: 'image/jpeg' });
    expect(error).not.toBeNull();
    expect(await objectExists(path)).toBe(false);
  });

  it("refuses another account's path and a re-commit of the current photo", async () => {
    const [a, b] = await Promise.all([named(PHONES[0], 'Ayşe'), named(PHONES[1], 'Burak')]);
    const pathA = await setPhoto(a);
    const invalid = { status: 422, body: errorBody('photo_invalid') };
    expect(await profile(b, { action: 'photo-commit', path: pathA })).toEqual(invalid);
    expect(await profile(a, { action: 'photo-commit', path: pathA })).toEqual(invalid);
    expect(await objectExists(pathA)).toBe(true);
  });

  it('hides the photo after reports from 2 accounts, not after 2 reports from one', async () => {
    const [a, b, c] = await Promise.all([
      named(PHONES[0], 'Ayşe'),
      named(PHONES[1], 'Burak'),
      named(PHONES[2], 'Cem'),
    ]);
    const idA = await publicIdOf(a);
    await setPhoto(a);
    const report = (client: Client) =>
      invoke(client, 'safety', {
        action: 'report',
        target: 'profile',
        publicId: idA,
        reason: 'inappropriate',
      });

    // C cannot see A yet: the report is refused like profile/get and writes nothing.
    expect(await report(c)).toEqual({ status: 404, body: errorBody('not_found') });

    const roomId = await room(a, b, 'profile', 'anonymous');
    expect(await report(b)).toEqual({ status: 200, body: { ok: true } });
    expect(await report(b)).toEqual({ status: 200, body: { ok: true } });
    expect(((await get(b, idA)).body as ProfileView).photoUrl).toEqual(expect.any(String));

    // B leaves; C joins the same room and reports too.
    await invoke(b, 'rooms', { action: 'leave' });
    await checkInAt(c, venue, V, 2);
    await join(a, c, roomId);
    expect(await report(c)).toEqual({ status: 200, body: { ok: true } });

    expect(((await get(c, idA)).body as ProfileView).photoUrl).toBeNull();
    expect((await get(a, idA)).body).toMatchObject({ photoUrl: null, photoHidden: true });

    const reports = await sql`
      select reporter_id, target_type, profile_snapshot, photo_copy from public.reports
      where reported_user_id = ${await userIdOf(a)} order by created_at
    `;
    expect(reports).toHaveLength(3);
    expect(reports[0]?.profile_snapshot).toMatchObject({ display_name: 'Ayşe', bio: null });
    expect(new Uint8Array(reports[0]?.photo_copy)).toEqual(CLEAN);

    // A new photo is visible again.
    await setPhoto(a, jpeg(DQT));
    expect(((await get(c, idA)).body as ProfileView).photoUrl).toEqual(expect.any(String));
  });

  it('admin:remove-photo deletes the photo and the path', async () => {
    const a = await named(PHONES[0], 'Ayşe');
    const path = await setPhoto(a);
    expect(await removeProfilePhoto(admin, await publicIdOf(a))).toBe(true);
    expect(await objectExists(path)).toBe(false);
    const [row] = await sql`select photo_path from public.profiles where id = ${await userIdOf(a)}`;
    expect(row?.photo_path).toBeNull();
    expect(await removeProfilePhoto(admin, await publicIdOf(a))).toBe(false);
  });

  it('goes with the account (deletion and ban)', async () => {
    const [a, b] = await Promise.all([named(PHONES[0], 'Ayşe'), named(PHONES[1], 'Burak')]);
    const pathA = await setPhoto(a);
    const pathB = await setPhoto(b);
    expect((await invoke(a, 'account', { action: 'delete' })).status).toBe(200);
    expect(await objectExists(pathA)).toBe(false);
    await banUser(admin, await userIdOf(b));
    expect(await objectExists(pathB)).toBe(false);
  });
});

describe('reports stay closed to the app', () => {
  it('grants no role but the server any access to reports or photo_copy', async () => {
    const privileges = await sql`
      select r.role,
             has_table_privilege(r.role, 'public.reports', 'select, insert, update, delete') as tbl,
             has_column_privilege(r.role, 'public.reports', 'photo_copy', 'select, insert, update') as col
      from (values ('anon'), ('authenticated')) as r(role)
    `;
    expect(privileges).toEqual([
      { role: 'anon', tbl: false, col: false },
      { role: 'authenticated', tbl: false, col: false },
    ]);
    const [rls] = await sql`
      select relrowsecurity from pg_class where oid = 'public.reports'::regclass
    `;
    expect(rls?.relrowsecurity).toBe(true);
  });

  it('refuses reads and writes of report rows, photo copy included, from any client', async () => {
    const [a, b] = await Promise.all([named(PHONES[0], 'Ayşe'), named(PHONES[1], 'Burak')]);
    await setPhoto(a);
    await room(a, b, 'profile', 'anonymous');
    const res = await invoke(b, 'safety', {
      action: 'report',
      target: 'profile',
      publicId: await publicIdOf(a),
      reason: 'spam',
    });
    expect(res.status).toBe(200);

    const anon = createClient(apiUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const client of [a, b, anon] as Client[]) {
      for (const columns of ['id', 'photo_copy', 'profile_snapshot', '*']) {
        const { data, error } = await client.from('reports').select(columns);
        expect(error?.code, columns).toBe('42501');
        expect(data).toBeNull();
      }
      const insert = await client.from('reports').insert({ reason: 'spam' } as never);
      expect(insert.error?.code).toBe('42501');
      const update = await client
        .from('reports')
        .update({ photo_copy: null } as never)
        .neq('id', randomUUID());
      expect(update.error?.code).toBe('42501');
    }
    // The row is there, with the copy, for the server only.
    const [row] = await sql`select photo_copy is not null as has_copy from public.reports`;
    expect(row?.has_copy).toBe(true);
  });
});
