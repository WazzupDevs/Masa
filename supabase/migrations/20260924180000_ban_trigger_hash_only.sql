-- The ban trigger only records the phone hash; it no longer writes to the auth schema.
-- Sign-in and token refresh are blocked by `pnpm admin:ban`, which also sets an Auth ban
-- (auth.admin.updateUserById ... ban_duration) through the Admin API.
create or replace function private.on_profile_banned()
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

  return new;
end;
$$;
