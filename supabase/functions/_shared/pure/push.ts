import { headcountLabel } from './checkin.ts';
import type { Concept } from './rooms.ts';

// Push notification texts are built on the server, so they live here rather than in the app's
// tr.ts (which re-exports them). They carry only what another table may see: alias, headcount,
// concept (MVP_SPEC rule 4).
const CONCEPT_NAMES: Record<Concept, string> = { tabu: 'Tabu', sohbet: 'Sohbet' };

export type PushMessage = { title: string; body: string };

export function joinRequestPush(alias: string, headcount: number, concept: Concept): PushMessage {
  return {
    title: 'Katılma isteği',
    body: `${alias} (${headcountLabel(headcount)} kişi) ${CONCEPT_NAMES[concept]} odana katılmak istiyor.`,
  };
}

export function joinAcceptedPush(): PushMessage {
  return { title: 'İsteğin kabul edildi', body: 'Odaya katılabilirsin.' };
}

// v2 (docs/SPEC_V2.md §6.4): no sender, no preview. The friend request text follows the DM one.
export function dmPush(): PushMessage {
  return { title: 'Masa', body: 'Yeni bir mesajın var' };
}

export function friendRequestPush(): PushMessage {
  return { title: 'Masa', body: 'Yeni bir arkadaşlık isteğin var' };
}

export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}
