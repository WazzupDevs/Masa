-- Venue chat photos (docs/SPEC_V3.md §7.2). A profiled message shows its sender's photo to the
-- same audience that sees its display name: the accounts with a live table at the venue. Photos
-- are private and only Edge Functions sign them, so the page is read through venue-chat/page
-- (service role), like dm/inbox. An anonymous message never carries a photo path; neither does a
-- hidden photo. venue_chat_page stays for app builds that read it directly.
create function public.venue_chat_page_for(
  target_user_id uuid,
  target_venue_id uuid,
  before timestamptz default null,
  page_size integer default 50
)
returns table (
  id uuid,
  profiled boolean,
  sender_alias text,
  display_name text,
  photo_path text,
  body text,
  created_at timestamptz,
  from_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.profiled,
         case when m.profiled then null else m.sender_alias end,
         case when m.profiled then p.display_name else null end,
         case when m.profiled and p.photo_hidden_at is null then p.photo_path else null end,
         m.body, m.created_at, m.sender_user_id = target_user_id
  from public.venue_chat_messages m
  left join public.profiles p on p.id = m.sender_user_id
  where m.venue_id = target_venue_id
    and (private.venue_chat_session(target_user_id, target_venue_id)).id is not null
    and (before is null or m.created_at < before)
    and (m.hidden_at is null or m.sender_user_id = target_user_id)
    and not private.is_blocked_between(target_user_id, m.sender_user_id)
  order by m.created_at desc
  limit least(greatest(page_size, 1), 100);
$$;

revoke all on function public.venue_chat_page_for(uuid, uuid, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.venue_chat_page_for(uuid, uuid, timestamptz, integer)
  to service_role;
