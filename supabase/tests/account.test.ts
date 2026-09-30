import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import type { AccountRequest } from '../functions/_shared/pure/api/account.ts';
import { istanbulToday } from '../functions/_shared/pure/age.ts';
import { CURRENT_KVKK_VERSION, CURRENT_TERMS_VERSION } from '../functions/_shared/pure/consent.ts';
import type { Database } from '../functions/_shared/pure/database.ts';
import { deleteAccount } from '../../scripts/admin/account.ts';
import { banUser } from '../../scripts/admin/ban.ts';
import { admin, anonKey, apiUrl, deleteUserByPhone, invoke, signIn, sql } from './local.ts';

const PHONE_A = '+905550000001';
const PHONE_B = '+905550000002';

type Client = SupabaseClient<Database>;

const onboarding: AccountRequest = {
  action: 'complete-onboarding',
  termsVersion: CURRENT_TERMS_VERSION,
  kvkkVersion: CURRENT_KVKK_VERSION,
  displayName: 'Ayşe',
  birthDate: '2000-01-15',
};

// 17 on any day of the year: 1 January, 17 years ago.
const UNDER_AGE_BIRTH_DATE = `${istanbulToday(new Date()).year - 17}-01-01`;

const call = (client: Client, body: Record<string, unknown>) => invoke(client, 'account', body);

async function userId(client: Client): Promise<string> {
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error('not signed in');
  return data.user.id;
}

// Every public column with a foreign key to auth.users must be empty for this user.
async function expectNothingLeftFor(id: string): Promise<void> {
  const refs = await sql<{ table_name: string; column_name: string }[]>`
    select cl.relname as table_name, att.attname as column_name
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.contype = 'f' and ns.nspname = 'public' and con.confrelid = 'auth.users'::regclass
  `;
  expect(refs.length).toBeGreaterThan(0);
  for (const ref of refs) {
    const rows = await sql`
      select 1 from ${sql('public.' + ref.table_name)} where ${sql(ref.column_name)} = ${id}
    `;
    expect(rows, `${ref.table_name}.${ref.column_name}`).toHaveLength(0);
  }
}

afterEach(async () => {
  await deleteUserByPhone(PHONE_A);
  await deleteUserByPhone(PHONE_B);
  await sql`truncate public.banned_phones`;
});

afterAll(async () => {
  await sql.end();
});

describe('account/complete-onboarding', () => {
  it('stores consents with timestamps and versions, the display name and the birth date', async () => {
    const client = await signIn(PHONE_A);
    expect(await call(client, onboarding)).toEqual({ status: 200, body: { ok: true } });

    const [row] = await sql`
      select *, to_char(birth_date, 'YYYY-MM-DD') as birth
      from public.profiles where id = ${await userId(client)}
    `;
    expect(row).toMatchObject({
      terms_version: CURRENT_TERMS_VERSION,
      kvkk_version: CURRENT_KVKK_VERSION,
      display_name: 'Ayşe',
      birth: '2000-01-15',
      has_birth_date: true,
    });
    expect(row?.age_confirmed_at).toBeInstanceOf(Date);
    expect(row?.terms_accepted_at).toBeInstanceOf(Date);
    expect(row?.kvkk_accepted_at).toBeInstanceOf(Date);
  });

  it('rejects outdated text versions', async () => {
    const client = await signIn(PHONE_A);
    const res = await call(client, { ...onboarding, termsVersion: 'old' });
    expect(res).toEqual({
      status: 409,
      body: { error: { code: 'consent_outdated', message: expect.any(String) } },
    });
  });

  it('rejects invalid bodies with the uniform error format', async () => {
    const client = await signIn(PHONE_A);
    const res = await call(client, { action: 'complete-onboarding', termsVersion: 1 });
    expect(res).toEqual({
      status: 400,
      body: { error: { code: 'bad_request', message: expect.any(String) } },
    });
  });

  it('rejects calls without a user token', async () => {
    const res = await fetch(`${apiUrl}/functions/v1/account`, {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify(onboarding),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'unauthorized', message: expect.any(String) },
    });
  });
});

describe('account/complete-onboarding: sign-up = profile (docs/SPEC_V3.md §3)', () => {
  it('needs a display name and a birth date for a new account, and writes nothing without', async () => {
    const client = await signIn(PHONE_A);
    const required = {
      status: 409,
      body: { error: { code: 'profile_required', message: expect.any(String) } },
    };
    expect(await call(client, { ...onboarding, birthDate: undefined })).toEqual(required);
    expect(await call(client, { ...onboarding, displayName: undefined })).toEqual(required);
    expect(
      await sql`select 1 from public.profiles where id = ${await userId(client)}`,
    ).toHaveLength(0);
  });

  it('rejects impossible and future birth dates and invalid names', async () => {
    const client = await signIn(PHONE_A);
    for (const birthDate of ['2001-02-29', '15.01.2000', '2999-01-01', '1900-01-01']) {
      expect(await call(client, { ...onboarding, birthDate })).toEqual({
        status: 422,
        body: { error: { code: 'birth_date_invalid', message: expect.any(String) } },
      });
    }
    expect(await call(client, { ...onboarding, displayName: 'a' })).toEqual({
      status: 422,
      body: { error: { code: 'display_name_invalid', message: expect.any(String) } },
    });
    expect(
      await sql`select 1 from public.profiles where id = ${await userId(client)}`,
    ).toHaveLength(0);
  });

  it('deletes the account under 18 and keeps nothing', async () => {
    const client = await signIn(PHONE_A);
    const id = await userId(client);
    expect(await call(client, { ...onboarding, birthDate: UNDER_AGE_BIRTH_DATE })).toEqual({
      status: 403,
      body: { error: { code: 'under_age', message: expect.any(String) } },
    });
    expect(await sql`select 1 from auth.users where id = ${id}`).toHaveLength(0);
    expect(await sql`select 1 from public.profiles where id = ${id}`).toHaveLength(0);
    expect(await sql`select 1 from public.banned_phones`).toHaveLength(0);
    await expectNothingLeftFor(id);
    // The token issued before is refused; the same number may sign up again.
    expect((await call(client, onboarding)).status).toBe(401);
    const again = await signIn(PHONE_A);
    expect(await call(again, onboarding)).toEqual({ status: 200, body: { ok: true } });
  });

  it('deletes an existing account whose owner enters an under-18 date', async () => {
    const client = await signIn(PHONE_A);
    const id = await userId(client);
    // An account from before v3: consents, no name, no birth date.
    await sql`
      insert into public.profiles
        (id, age_confirmed_at, terms_accepted_at, terms_version, kvkk_accepted_at, kvkk_version)
      values (${id}, now(), now(), 'draft-0', now(), 'draft-0')
    `;
    expect((await call(client, { ...onboarding, birthDate: UNDER_AGE_BIRTH_DATE })).status).toBe(
      403,
    );
    expect(await sql`select 1 from auth.users where id = ${id}`).toHaveLength(0);
    await expectNothingLeftFor(id);
  });

  it('re-consents without the profile fields, and never changes the birth date', async () => {
    const client = await signIn(PHONE_A);
    await call(client, onboarding);
    expect(
      await call(client, { ...onboarding, displayName: undefined, birthDate: undefined }),
    ).toEqual({ status: 200, body: { ok: true } });
    expect(await call(client, { ...onboarding, birthDate: '1999-01-15' })).toEqual({
      status: 422,
      body: { error: { code: 'birth_date_invalid', message: expect.any(String) } },
    });
    const [row] = await sql`
      select to_char(birth_date, 'YYYY-MM-DD') as birth from public.profiles
      where id = ${await userId(client)}
    `;
    expect(row?.birth).toBe('2000-01-15');
  });

  it('never lets the client read the birth date, only whether it is set', async () => {
    const client = await signIn(PHONE_A);
    await call(client, onboarding);
    const hidden = await client.from('profiles').select('birth_date');
    expect(hidden.error?.code).toBe('42501');
    const all = await client.from('profiles').select('*');
    expect(all.error?.code).toBe('42501');
    const flag = await client.from('profiles').select('has_birth_date').single();
    expect(flag.data).toEqual({ has_birth_date: true });
  });
});

describe('profiles RLS', () => {
  it('lets a user read only their own row and write none', async () => {
    const a = await signIn(PHONE_A);
    const b = await signIn(PHONE_B);
    await call(a, onboarding);
    await call(b, onboarding);

    const { data } = await a.from('profiles').select('id');
    expect(data).toEqual([{ id: await userId(a) }]);

    const update = await a
      .from('profiles')
      .update({ terms_version: 'x' })
      .eq('id', await userId(a));
    expect(update.error?.code).toBe('42501');
  });
});

describe('ban', () => {
  it('keeps the phone hash, deletes the account and invalidates its access token', async () => {
    const client = await signIn(PHONE_A);
    await call(client, onboarding);
    const id = await userId(client);

    await banUser(admin, id);

    expect(await sql`select 1 from public.banned_phones`).toHaveLength(1);
    expect(await sql`select 1 from auth.users where id = ${id}`).toHaveLength(0);
    expect(await sql`select 1 from public.profiles where id = ${id}`).toHaveLength(0);

    // The access token issued before the ban has not expired yet; auth.getUser rejects it.
    expect(await call(client, onboarding)).toEqual({
      status: 401,
      body: { error: { code: 'unauthorized', message: expect.any(String) } },
    });
  });

  it('rejects signing up again with a banned number', async () => {
    const client = await signIn(PHONE_A);
    await banUser(admin, await userId(client));

    await expect(signIn(PHONE_A)).rejects.toMatchObject({
      status: 403,
      message: 'signup_not_allowed',
    });
  });

  it('rejects non-Turkish-mobile numbers with the same response as banned ones', async () => {
    await expect(signIn('+14152127777')).rejects.toMatchObject({
      status: 403,
      message: 'signup_not_allowed',
    });
  });

  it('does not let clients record banned phones', async () => {
    const client = await signIn(PHONE_A);
    const { error } = await client.rpc('record_banned_phone', {
      target_user_id: await userId(client),
    });
    expect(error?.code).toBe('42501');
    expect(await sql`select 1 from public.banned_phones`).toHaveLength(0);
  });
});

describe('account/delete', () => {
  it('removes the user and every row that references them', async () => {
    const client = await signIn(PHONE_A);
    await call(client, onboarding);
    const id = await userId(client);

    expect(await call(client, { action: 'delete' })).toEqual({ status: 200, body: { ok: true } });

    expect(await sql`select 1 from auth.users where id = ${id}`).toHaveLength(0);

    await expectNothingLeftFor(id);
  });

  it('keeps every public foreign key cascading or nulling on delete', async () => {
    // Anything else would block account deletion or leave user data behind.
    const blocking = await sql`
      select con.conname
      from pg_constraint con
      join pg_namespace ns on ns.oid = con.connamespace
      where con.contype = 'f' and ns.nspname = 'public' and con.confdeltype not in ('c', 'n')
    `;
    expect(blocking.map((r) => r.conname)).toEqual([]);
  });
});

describe('admin:delete', () => {
  it('deletes like account/delete: the user, every row, and the access token', async () => {
    const client = await signIn(PHONE_A);
    await call(client, onboarding);
    const id = await userId(client);

    await deleteAccount(admin, id);

    expect(await sql`select 1 from auth.users where id = ${id}`).toHaveLength(0);
    await expectNothingLeftFor(id);
    expect(await call(client, onboarding)).toEqual({
      status: 401,
      body: { error: { code: 'unauthorized', message: expect.any(String) } },
    });
  });

  it('does not ban: the number can sign up again', async () => {
    const id = await userId(await signIn(PHONE_A));
    await deleteAccount(admin, id);

    expect(await sql`select 1 from public.banned_phones`).toHaveLength(0);
    const again = await signIn(PHONE_A);
    expect(await userId(again)).not.toBe(id);
  });
});
