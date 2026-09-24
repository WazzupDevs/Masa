// Chat rules (MVP_SPEC §7).
export const MAX_MESSAGE_LENGTH = 200;
export const MIN_MESSAGE_INTERVAL_MS = 1000;

// Trimmed message, or null when empty or longer than 200 characters (code points, like the
// database's char_length).
export function prepareMessage(raw: string): string | null {
  const body = raw.trim();
  const length = [...body].length;
  return length >= 1 && length <= MAX_MESSAGE_LENGTH ? body : null;
}

export const REPORT_REASONS = ['harassment', 'inappropriate', 'spam', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
