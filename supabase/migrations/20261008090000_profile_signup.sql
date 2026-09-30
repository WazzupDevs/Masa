-- v3 step 1 (docs/SPEC_V3.md §3): sign-up = profile. The display name and the birth date are
-- required at sign-up; under 18 the account is deleted in the same call and nothing is kept.
--
-- The birth date is never shown to anyone, the owner included: the column is not granted to the
-- client (column grants of profiles_v2 stay). Others see the age, computed by the profile
-- function. The client reads only whether its own birth date is set, for the onboarding gate.
alter table public.profiles
  add column birth_date date
    check (birth_date >= date '1900-01-01'),
  add column has_birth_date boolean generated always as (birth_date is not null) stored;

grant select (has_birth_date) on table public.profiles to authenticated;
