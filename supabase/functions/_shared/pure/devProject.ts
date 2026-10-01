// The hosted dev project (CLAUDE.md, "Barındırılan dev projesi"): the only remote where test-only
// switches work. The pilot and Play project is never listed here.
export const DEV_PROJECT_HOST = 'kphwbpqxhugrpoicmski.supabase.co';

// SUPABASE_URL as Edge Functions see it on the local stack (`functions serve`: http://kong:8000)
// and as scripts see it from the host or the Android emulator.
const LOCAL_HOSTS = new Set(['kong', '127.0.0.1', 'localhost', '10.0.2.2']);

export function isLocalUrl(url: string): boolean {
  return LOCAL_HOSTS.has(hostOf(url) ?? '');
}

export function isDevProjectUrl(url: string): boolean {
  return url.startsWith('https://') && hostOf(url) === DEV_PROJECT_HOST;
}

// No URL global in pure/ (no DOM or Node types): scheme, host, optional port, then the path.
const URL_HOST = /^https?:\/\/([a-z0-9.-]+)(?::\d+)?(?:[/?#]|$)/i;

function hostOf(url: string): string | null {
  return URL_HOST.exec(url)?.[1]?.toLowerCase() ?? null;
}

// CHECKIN_SKIP_LOCATION=1 (a function secret, dev only): check-in skips the boundary and 300 m
// check. It works only when the functions run on the local stack or the dev project; anywhere
// else (the pilot) a set secret is ignored and reported, and the check stays.
export type LocationCheck = 'enforced' | 'skipped' | 'ignored';

export function locationCheck(
  flag: string | undefined,
  supabaseUrl: string | undefined,
): LocationCheck {
  if (flag !== '1') return 'enforced';
  const url = supabaseUrl ?? '';
  return isLocalUrl(url) || isDevProjectUrl(url) ? 'skipped' : 'ignored';
}
