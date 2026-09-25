import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../supabase/functions/_shared/pure/database.ts';
import {
  EVENT_DEFAULT_HOURS,
  EVENT_TITLE_MAX,
} from '../../supabase/functions/_shared/pure/explore.ts';

// `pnpm admin:event` (docs/SPEC_V2.md §4): planned venue events for Keşfet.
//   add <venue> "<title>" <start> [<end>]   venue: id, or source ref (node/123, test/hush-coffee)
//   list                                    upcoming and running events
//   remove <eventId>
// Times: ISO 8601 with offset (2026-09-29T20:00+03:00) or "2026-09-29 20:00" (Istanbul time).

export type EventCommand =
  | { kind: 'add'; venue: string; title: string; startsAt: string; endsAt: string }
  | { kind: 'list' }
  | { kind: 'remove'; eventId: string };

export const EVENT_USAGE = [
  'pnpm admin:event add <venueId|sourceRef> "<title>" <start> [<end>]',
  'pnpm admin:event list',
  'pnpm admin:event remove <eventId>',
  'Times: 2026-09-29T20:00+03:00 or "2026-09-29 20:00" (Istanbul).',
].join('\n');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

// Returns an ISO timestamp, or null when the input is not a time we accept.
export function parseEventTime(input: string): string | null {
  const local = LOCAL.exec(input.trim());
  const text = local ? `${local[1]}T${local[2]}:00+03:00` : input.trim();
  if (!local && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) return null;
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export function parseEventCommand(args: readonly string[]): EventCommand {
  const [kind, ...rest] = args;
  if (kind === 'list' && rest.length === 0) return { kind: 'list' };
  if (kind === 'remove' && rest.length === 1 && rest[0] && isUuid(rest[0])) {
    return { kind: 'remove', eventId: rest[0] };
  }
  if (kind === 'add' && (rest.length === 3 || rest.length === 4)) {
    const [venue = '', rawTitle = '', start = '', end] = rest;
    const title = rawTitle.trim();
    if (!venue.trim()) throw new Error('Venue is required.');
    if (title.length < 1 || [...title].length > EVENT_TITLE_MAX) {
      throw new Error(`Title must be 1–${EVENT_TITLE_MAX} characters.`);
    }
    const startsAt = parseEventTime(start);
    if (!startsAt) throw new Error(`Invalid start time: ${start}`);
    const endsAt = end
      ? parseEventTime(end)
      : new Date(Date.parse(startsAt) + EVENT_DEFAULT_HOURS * 3_600_000).toISOString();
    if (!endsAt) throw new Error(`Invalid end time: ${end}`);
    if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error('End must be after start.');
    return { kind: 'add', venue: venue.trim(), title, startsAt, endsAt };
  }
  throw new Error(EVENT_USAGE);
}

type Admin = SupabaseClient<Database>;

async function resolveVenue(admin: Admin, venue: string): Promise<{ id: string; name: string }> {
  const query = admin.from('venues').select('id, name');
  const { data, error } = isUuid(venue)
    ? await query.eq('id', venue).maybeSingle()
    : await query.eq('source_ref', venue).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No venue ${venue}`);
  return data;
}

export async function runEventCommand(admin: Admin, command: EventCommand): Promise<string> {
  switch (command.kind) {
    case 'add': {
      const venue = await resolveVenue(admin, command.venue);
      const { data, error } = await admin
        .from('venue_events')
        .insert({
          venue_id: venue.id,
          title: command.title,
          starts_at: command.startsAt,
          ends_at: command.endsAt,
        })
        .select('id')
        .single();
      if (error) throw error;
      return `Added ${data.id}: ${venue.name} · ${command.title} · ${command.startsAt} → ${command.endsAt}`;
    }
    case 'list': {
      const { data, error } = await admin
        .from('venue_events')
        .select('id, title, starts_at, ends_at, venues(name)')
        .gt('ends_at', new Date().toISOString())
        .order('starts_at');
      if (error) throw error;
      if (data.length === 0) return 'No upcoming events.';
      return data
        .map((e) => `${e.id}  ${e.starts_at} → ${e.ends_at}  ${e.venues?.name ?? '?'} · ${e.title}`)
        .join('\n');
    }
    case 'remove': {
      const { data, error } = await admin
        .from('venue_events')
        .delete()
        .eq('id', command.eventId)
        .select('id');
      if (error) throw error;
      return data.length === 1 ? `Removed ${command.eventId}` : `No event ${command.eventId}`;
    }
  }
}
