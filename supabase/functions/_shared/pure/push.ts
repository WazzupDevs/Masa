import { APP_NAME } from './brand.ts';
import { headcountLabel } from './checkin.ts';
import type { PushTarget } from './navigation.ts';

// Push notification texts are built on the server, so they live here rather than in the app's
// tr.ts (which re-exports them). They carry only what another table may see: alias and headcount
// (rule 4). A room has no game when it is created (docs/SPEC_V3.md §5.1).

// `target`: the screen a tap opens (docs/SPEC_V3.md §18.3); no id, no sender, no content.
export type PushMessage = { title: string; body: string; target?: PushTarget };

export function joinRequestPush(alias: string, headcount: number): PushMessage {
  return {
    title: 'Katılma isteği',
    body: `${alias} (${headcountLabel(headcount)} kişi) odana katılmak istiyor.`,
  };
}

export function joinAcceptedPush(): PushMessage {
  return { title: 'İsteğin kabul edildi', body: 'Odaya katılabilirsin.' };
}

// v2 (docs/SPEC_V2.md §6.4): no sender, no preview. The friend request text follows the DM one.
export function dmPush(): PushMessage {
  return { title: APP_NAME, body: 'Yeni bir mesajın var', target: 'messages' };
}

export function friendRequestPush(): PushMessage {
  return { title: APP_NAME, body: 'Yeni bir arkadaşlık isteğin var', target: 'notifications' };
}

export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}
