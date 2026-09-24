-- M1: profiles, banned phone hashes, ban trigger and signup hook.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- profiles ------------------------------------------------------------------
-- A row exists only once onboarding is complete; it is written by the `account` Edge Function.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  is_banned boolean not null default false,
  age_confirmed_at timestamptz not null,
  terms_accepted_at timestamptz not null,
  terms_version text not null,
  kvkk_accepted_at timestamptz not null,
  kvkk_version text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

create policy "profiles: read own row"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- banned_phones -------------------------------------------------------------
-- HMAC of the phone number, so a ban survives account deletion without storing the number.
create table public.banned_phones (
  phone_hash text primary key,
  created_at timestamptz not null default now()
);

alter table public.banned_phones enable row level security;
revoke all on table public.banned_phones from anon, authenticated;
-- No policies: only server-side code reads or writes this table.

-- Phone hashing -------------------------------------------------------------
-- Key lives in Supabase Vault as `phone_hash_key`. Single key, no rotation (see MVP_SPEC §8).
create function private.phone_hash(phone text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  key text;
begin
  select decrypted_secret into key
  from vault.decrypted_secrets
  where name = 'phone_hash_key';

  if key is null then
    raise exception 'vault secret phone_hash_key is missing';
  end if;

  -- auth.users.phone has no leading "+"; strip everything but digits so formats agree.
  return encode(
    extensions.hmac(regexp_replace(phone, '[^0-9]', '', 'g'), key, 'sha256'),
    'hex'
  );
end;
$$;

revoke all on function private.phone_hash(text) from public, anon, authenticated;

-- Ban trigger ---------------------------------------------------------------
-- Bans are set by hand in the dashboard. Record the phone hash and end every session;
-- access tokens stay valid until expiry, so Edge Functions also check is_banned on writes.
create function private.on_profile_banned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_phone text;
begin
  select phone into user_phone from auth.users where id = new.id;

  if user_phone is not null and user_phone <> '' then
    insert into public.banned_phones (phone_hash)
    values (private.phone_hash(user_phone))
    on conflict (phone_hash) do nothing;
  end if;

  delete from auth.sessions where user_id = new.id;
  return new;
end;
$$;

revoke all on function private.on_profile_banned() from public, anon, authenticated;

create trigger profiles_on_banned
  after update of is_banned on public.profiles
  for each row
  when (new.is_banned and not old.is_banned)
  execute function private.on_profile_banned();

-- before_user_created auth hook ----------------------------------------------
-- Rejects non-Turkish-mobile numbers and banned phones before an account (and OTP) is created.
create function private.before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  phone text := regexp_replace(coalesce(event -> 'user' ->> 'phone', ''), '[^0-9]', '', 'g');
begin
  if phone !~ '^905[0-9]{9}$' then
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 400, 'message', 'unsupported_phone')
    );
  end if;

  if exists (select 1 from public.banned_phones where phone_hash = private.phone_hash(phone)) then
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 403, 'message', 'phone_banned')
    );
  end if;

  return '{}'::jsonb;
end;
$$;

revoke all on function private.before_user_created(jsonb) from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.before_user_created(jsonb) to supabase_auth_admin;
