import type { ReportReason } from '../chat.ts';

// `chat` and `safety` Edge Functions, shared with the mobile app.
export type ChatRequest = { action: 'send'; roomId: string; body: string };
export type ChatResponse = { messageId: string };

export type SafetyRequest =
  | { action: 'report'; target?: 'room'; roomId: string; reason: ReportReason }
  // A profile the reporter can see now (docs/SPEC_V2.md §5.3); otherwise `not_found`, the same
  // answer profile/get gives.
  | { action: 'report'; target: 'profile'; publicId: string; reason: ReportReason }
  | { action: 'block'; roomId: string }
  | { action: 'unblock'; blockId: string };
export type SafetyResponse = { ok: true };
