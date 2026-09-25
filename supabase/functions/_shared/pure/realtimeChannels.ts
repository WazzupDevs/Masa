// One Realtime channel per topic, shared by every consumer of that topic.
//
// supabase-js returns the existing channel when a topic is asked for twice, and adding
// `postgres_changes` or `presence` callbacks to a channel that is joining or joined throws.
// Removing a channel is asynchronous: until the server acknowledges the leave, asking for the
// topic again returns the leaving channel, whose later teardown silently drops the new consumer.
// Both happen when a screen is mounted again before the old one is gone (a stack replace mounts
// the new screen first). This registry counts consumers per topic, opens the channel once, fans
// events out, and opens a fresh channel only after a pending removal has finished.

export interface ChannelLike {
  subscribe(callback?: (status: string) => void): unknown;
}

export interface ChannelClient<C extends ChannelLike> {
  removeChannel(channel: C): Promise<unknown>;
}

// Builds the channel for a topic with its bindings; `emit` delivers an event to every consumer.
// `onStatus` (optional) sees the subscribe status, e.g. to track presence once subscribed.
export type OpenChannel<C extends ChannelLike, E> = (emit: (event: E) => void) => {
  channel: C;
  onStatus?: (status: string, channel: C) => void;
};

type Entry<C extends ChannelLike, E> = {
  listeners: Set<(event: E) => void>;
  channel: C | null;
  cancelled: boolean;
};

export function createChannelRegistry<C extends ChannelLike>(client: ChannelClient<C>) {
  // Keyed by topic; the value type varies per topic, so entries are stored untyped.
  const entries = new Map<string, Entry<C, never>>();
  const removals = new Map<string, Promise<void>>();

  function open<E>(entry: Entry<C, E>, build: OpenChannel<C, E>): void {
    if (entry.cancelled) return;
    const { channel, onStatus } = build((event) => {
      for (const listener of entry.listeners) listener(event);
    });
    entry.channel = channel;
    channel.subscribe((status) => onStatus?.(status, channel));
  }

  function acquire<E>(
    topic: string,
    build: OpenChannel<C, E>,
    listener: (event: E) => void,
  ): () => void {
    let entry = entries.get(topic) as Entry<C, E> | undefined;
    if (!entry) {
      const created: Entry<C, E> = { listeners: new Set(), channel: null, cancelled: false };
      entry = created;
      entries.set(topic, created as unknown as Entry<C, never>);
      const pending = removals.get(topic);
      if (pending) void pending.then(() => open(created, build));
      else open(created, build);
    }
    const current = entry;
    current.listeners.add(listener);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      current.listeners.delete(listener);
      if (current.listeners.size > 0 || entries.get(topic) !== (current as unknown)) return;
      entries.delete(topic);
      current.cancelled = true;
      if (!current.channel) return;
      const removal = client
        .removeChannel(current.channel)
        .then(() => undefined)
        .catch(() => undefined)
        .finally(() => {
          if (removals.get(topic) === removal) removals.delete(topic);
        });
      removals.set(topic, removal);
    };
  }

  return { acquire, size: (): number => entries.size };
}
