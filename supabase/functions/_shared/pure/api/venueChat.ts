// `venue-chat` Edge Function, shared with the mobile app (docs/SPEC_V3.md §7). Reading is the
// `venue_chat_page` RPC.
export type VenueChatRequest = {
  action: 'send';
  venueId: string;
  body: string;
  // With the display name instead of the table alias, per message (§7.3).
  profiled: boolean;
};
export type VenueChatResponse = { messageId: string };
