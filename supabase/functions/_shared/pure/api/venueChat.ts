// `venue-chat` Edge Function, shared with the mobile app (docs/SPEC_V3.md §7).
import type { VenueChatMessage } from '../venueChat.ts';

export type VenueChatRequest =
  | {
      action: 'send';
      venueId: string;
      body: string;
      // With the display name instead of the table alias, per message (§7.3).
      profiled: boolean;
    }
  // One page, newest first (§7.2): profiled messages carry their sender's photo, signed here.
  | { action: 'page'; venueId: string; before?: string };
export type VenueChatResponse = { messageId: string };
export type VenueChatPageResponse = { messages: VenueChatMessage[] };
