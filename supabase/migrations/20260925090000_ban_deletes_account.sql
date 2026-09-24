-- Ban = record the phone hash, then delete the account (`pnpm admin:ban`).
-- There is no "banned but existing" account anymore.

drop trigger if exists profiles_on_banned on public.profiles;
drop function if exists private.on_profile_banned();
alter table public.profiles drop column is_banned;

-- Service role only: called by `pnpm admin:ban` right before auth.admin.deleteUser.
create function public.record_banned_phone(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_phone text;
begin
  select phone into user_phone from auth.users where id = target_user_id;

  if user_phone is null or user_phone = '' then
    raise exception 'user % has no phone number', target_user_id;
  end if;

  insert into public.banned_phones (phone_hash)
  values (private.phone_hash(user_phone))
  on conflict (phone_hash) do nothing;
end;
$$;

revoke all on function public.record_banned_phone(uuid) from public, anon, authenticated;
grant execute on function public.record_banned_phone(uuid) to service_role;

-- Sign-up hook: one uniform rejection, so the response never reveals whether a number is banned.
create or replace function private.before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  phone text := regexp_replace(coalesce(event -> 'user' ->> 'phone', ''), '[^0-9]', '', 'g');
begin
  if phone !~ '^905[0-9]{9}$'
    or exists (select 1 from public.banned_phones where phone_hash = private.phone_hash(phone))
  then
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 403, 'message', 'signup_not_allowed')
    );
  end if;

  return '{}'::jsonb;
end;
$$;
