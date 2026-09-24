import type { ReportReason } from '../chat.ts';

// `chat` and `safety` Edge Functions, shared with the mobile app.
export type ChatRequest = { action: 'send'; roomId: string; body: string };
export type ChatResponse = { messageId: string };

export type SafetyRequest =
  | { action: 'report'; roomId: string; reason: ReportReason }
  | { action: 'block'; roomId: string }
  | { action: 'unblock'; blockId: string };
export type SafetyResponse = { ok: true };
