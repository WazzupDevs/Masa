// Only Turkish mobile numbers (+90 5xx xxx xx xx) are accepted in the MVP.
// The before_user_created auth hook enforces the same rule on the server.
export function toTrMobileE164(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('90')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return /^5\d{9}$/.test(digits) ? `+90${digits}` : null;
}
