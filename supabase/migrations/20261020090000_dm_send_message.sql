-- DM send answers with the message (adım 9.1, saha testi: gecikme). The sender's bubble turns from
-- the clock into a tick on the reply, without reading the page again: the app puts the message
-- into its page with the id and time from here. dm_send stays as it is for the deployed function
-- until the new one is out.
create function public.dm_send_message(
  target_user_id uuid,
  target_thread_id uuid,
  new_body text,
  min_interval_ms integer
)
returns table (other_user_id uuid, message_id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  other uuid;
begin
  other := public.dm_send(target_user_id, target_thread_id, new_body, min_interval_ms);
  -- The row dm_send just wrote: the rate limit allows one per sender per transaction time.
  return query
    select other, m.id, m.created_at
    from public.dm_messages m
    where m.thread_id = target_thread_id
      and m.sender_user_id = target_user_id
      and m.created_at = now()
    order by m.id
    limit 1;
end;
$$;

revoke all on function public.dm_send_message(uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.dm_send_message(uuid, uuid, text, integer) to service_role;
