import { describe, expect, it } from 'vitest';

import { createChannelRegistry } from './realtimeChannels.ts';

// A stand-in for supabase-js' Realtime client with the rules that matter here (realtime-js 2.x):
// channel(topic) returns the existing channel for a known topic; on('postgres_changes' |
// 'presence') throws while the channel is joining or joined; removeChannel only drops the channel
// from the client once the server acknowledges the leave.
type State = 'closed' | 'joining' | 'joined' | 'leaving';

class FakeChannel {
  state: State = 'closed';
  handlers: ((payload: string) => void)[] = [];
  constructor(readonly topic: string) {}
  on(type: 'postgres_changes' | 'presence' | 'broadcast', handler: (payload: string) => void) {
    if ((this.state === 'joining' || this.state === 'joined') && type !== 'broadcast') {
      throw new Error(`cannot add \`${type}\` callbacks for ${this.topic} after \`subscribe()\`.`);
    }
    this.handlers.push(handler);
    return this;
  }
  subscribe(callback?: (status: string) => void) {
    if (this.state !== 'closed') return this;
    this.state = 'joined';
    callback?.('SUBSCRIBED');
    return this;
  }
  deliver(payload: string) {
    if (this.state === 'joined') for (const h of this.handlers) h(payload);
  }
}

class FakeClient {
  channels: FakeChannel[] = [];
  private acks: (() => void)[] = [];
  channel(topic: string): FakeChannel {
    const existing = this.channels.find((c) => c.topic === topic);
    if (existing) return existing;
    const created = new FakeChannel(topic);
    this.channels.push(created);
    return created;
  }
  removeChannel(channel: FakeChannel): Promise<unknown> {
    channel.state = 'leaving';
    return new Promise((resolve) => {
      this.acks.push(() => {
        channel.state = 'closed';
        this.channels = this.channels.filter((c) => c !== channel);
        resolve('ok');
      });
    });
  }
  // The server acknowledges every pending leave.
  async ackLeaves() {
    const acks = this.acks.splice(0);
    for (const ack of acks) ack();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  live(topic: string) {
    return this.channels.find((c) => c.topic === topic && c.state === 'joined');
  }
}

const TOPIC = 'room:00000000-0000-4000-8000-000000000001';

describe('the per-screen channel pattern (the white screen)', () => {
  it('throws when a second screen of the same room subscribes before the first is gone', () => {
    const client = new FakeClient();
    // Old room screen, still mounted while the replacing screen mounts (stack replace).
    client
      .channel(TOPIC)
      .on('postgres_changes', () => {})
      .subscribe();
    expect(() => client.channel(TOPIC).on('postgres_changes', () => {})).toThrow(
      /after `subscribe\(\)`/,
    );
  });

  it('silently loses the new subscription when the screen comes back during the leave', async () => {
    const client = new FakeClient();
    const first = client.channel(TOPIC).on('postgres_changes', () => {});
    first.subscribe();
    void client.removeChannel(first);
    const received: string[] = [];
    client
      .channel(TOPIC)
      .on('postgres_changes', (p) => received.push(p))
      .subscribe();
    await client.ackLeaves();
    expect(client.live(TOPIC)).toBeUndefined();
    expect(received).toEqual([]);
  });
});

describe('createChannelRegistry', () => {
  function setup() {
    const client = new FakeClient();
    const registry = createChannelRegistry(client);
    const open = (emit: (event: string) => void) => ({
      channel: client.channel(TOPIC).on('postgres_changes', (p) => emit(p)),
    });
    return { client, registry, open };
  }

  it('shares one channel between overlapping consumers of a topic, without throwing', () => {
    const { client, registry, open } = setup();
    const a: string[] = [];
    const b: string[] = [];
    registry.acquire(TOPIC, open, (e) => a.push(e));
    expect(() => registry.acquire(TOPIC, open, (e) => b.push(e))).not.toThrow();
    client.live(TOPIC)?.deliver('change');
    expect(a).toEqual(['change']);
    expect(b).toEqual(['change']);
    expect(client.channels).toHaveLength(1);
  });

  it('keeps the channel until the last consumer releases it', async () => {
    const { client, registry, open } = setup();
    const releaseOld = registry.acquire(TOPIC, open, () => {});
    const received: string[] = [];
    const releaseNew = registry.acquire(TOPIC, open, (e) => received.push(e));
    releaseOld();
    await client.ackLeaves();
    client.live(TOPIC)?.deliver('still here');
    expect(received).toEqual(['still here']);
    releaseNew();
    await client.ackLeaves();
    expect(client.channels).toEqual([]);
    expect(registry.size()).toBe(0);
  });

  it('opens a fresh channel after the leave when the screen comes back during it', async () => {
    const { client, registry, open } = setup();
    registry.acquire(TOPIC, open, () => {})();
    const received: string[] = [];
    registry.acquire(TOPIC, open, (e) => received.push(e));
    expect(client.live(TOPIC)).toBeUndefined();
    await client.ackLeaves();
    client.live(TOPIC)?.deliver('after remount');
    expect(received).toEqual(['after remount']);
  });

  it('does not open a channel for a consumer that left before the pending leave finished', async () => {
    const { client, registry, open } = setup();
    registry.acquire(TOPIC, open, () => {})();
    registry.acquire(TOPIC, open, () => {})();
    await client.ackLeaves();
    expect(client.channels).toEqual([]);
  });

  it('passes the subscribe status and the channel to the opener', () => {
    const { client, registry } = setup();
    const statuses: string[] = [];
    registry.acquire(
      TOPIC,
      () => ({
        channel: client.channel(TOPIC),
        onStatus: (status) => statuses.push(status),
      }),
      () => {},
    );
    expect(statuses).toEqual(['SUBSCRIBED']);
  });

  it('ignores a second release', async () => {
    const { client, registry, open } = setup();
    const release = registry.acquire(TOPIC, open, () => {});
    const received: string[] = [];
    registry.acquire(TOPIC, open, (e) => received.push(e));
    release();
    release();
    await client.ackLeaves();
    client.live(TOPIC)?.deliver('x');
    expect(received).toEqual(['x']);
  });
});
