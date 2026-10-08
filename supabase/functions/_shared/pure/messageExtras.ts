// Replies and reactions on chat messages (docs/SPEC_V3.md §21), the same in the DM, the room chat
// and the venue chat. The pages send quotes and reactions as JSON; these turn them into the shapes
// the app shows, and decide what a tap on an emoji means.
import { isReaction, type Reaction } from './reactions.ts';

// The message a reply answers: its start, whether it is the reader's own, and its sender's label
// in that chat (the table alias, or a profiled venue message's display name; none in a DM). Gone
// when it was deleted or the reader cannot see it (which one is not told).
export type Quote =
  { gone: false; id: string; body: string; fromMe: boolean; name: string | null } | { gone: true };

// One emoji under a message: how many, and whether the reader is one of them. The room chat also
// names the reacting tables; the venue chat never says who.
export type ReactionCount = { emoji: Reaction; count: number; mine: boolean; aliases?: string[] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function parseQuote(raw: unknown): Quote | null {
  if (!isObject(raw)) return null;
  if (raw.gone === true) return { gone: true };
  if (typeof raw.id !== 'string' || typeof raw.body !== 'string') return { gone: true };
  return {
    gone: false,
    id: raw.id,
    body: raw.body,
    fromMe: raw.from_me === true,
    name: typeof raw.name === 'string' ? raw.name : null,
  };
}

// The DM sends one row per person ([{ emoji, from_me }]); shown like the others, per emoji.
export function parseDmReactions(raw: unknown): ReactionCount[] {
  if (!Array.isArray(raw)) return [];
  const out: ReactionCount[] = [];
  for (const row of raw) {
    if (!isObject(row) || !isReaction(row.emoji)) continue;
    const mine = row.from_me === true;
    const seen = out.find((r) => r.emoji === row.emoji);
    if (seen) {
      seen.count += 1;
      seen.mine ||= mine;
    } else out.push({ emoji: row.emoji, count: 1, mine });
  }
  return out;
}

// The room and venue chats send counts ([{ emoji, count, mine, aliases? }]). An emoji no longer in
// the set is left out.
export function parseReactionCounts(raw: unknown): ReactionCount[] {
  if (!Array.isArray(raw)) return [];
  const out: ReactionCount[] = [];
  for (const row of raw) {
    if (!isObject(row) || !isReaction(row.emoji) || typeof row.count !== 'number') continue;
    const aliases = Array.isArray(row.aliases)
      ? row.aliases.filter((a): a is string => typeof a === 'string')
      : undefined;
    out.push({
      emoji: row.emoji,
      count: row.count,
      mine: row.mine === true,
      ...(aliases ? { aliases } : {}),
    });
  }
  return out;
}

export function myReaction(list: readonly ReactionCount[]): Reaction | null {
  return list.find((r) => r.mine)?.emoji ?? null;
}

// One reaction per person per message: the same emoji again takes it back, another one replaces
// it.
export function nextReaction(current: Reaction | null, picked: Reaction): Reaction | null {
  return current === picked ? null : picked;
}

// The list as it will be once the server takes the reader's new reaction (null: none), shown at
// once. `alias` is the reader's table in the room chat, so its name moves with the reaction.
export function withMyReaction(
  list: readonly ReactionCount[],
  next: Reaction | null,
  alias?: string,
): ReactionCount[] {
  const out: ReactionCount[] = [];
  for (const r of list) {
    if (!r.mine) {
      out.push(r);
      continue;
    }
    if (r.count > 1) {
      out.push({
        ...r,
        count: r.count - 1,
        mine: false,
        ...(r.aliases ? { aliases: r.aliases.filter((a) => a !== alias) } : {}),
      });
    }
  }
  if (next === null) return out;
  const at = out.findIndex((r) => r.emoji === next);
  if (at === -1) {
    out.push({ emoji: next, count: 1, mine: true, ...(alias ? { aliases: [alias] } : {}) });
  } else {
    const r = out[at];
    if (r) {
      out[at] = {
        ...r,
        count: r.count + 1,
        mine: true,
        ...(r.aliases && alias ? { aliases: [...r.aliases, alias] } : {}),
      };
    }
  }
  return out;
}
