import { privateChannel, useChannel } from '@/lib/realtime';

// Listens to a data-free broadcast on a private channel; the handler refetches through RLS.
// Several consumers may listen to different events of the same topic (e.g. session:{id}).
export function useBroadcast(topic: string | null, event: string, onEvent: () => void): void {
  useChannel<string>(
    topic,
    (emit) => ({
      channel: privateChannel(topic ?? '').on(
        'broadcast',
        { event: '*' },
        (msg: { event: string }) => emit(msg.event),
      ),
    }),
    (received) => {
      if (received === event) onEvent();
    },
  );
}
