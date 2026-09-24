import {
  POSTHOG_DEFAULT_API_HOST,
  posthogPersonDeleteUrl,
  posthogPersonIds,
  posthogPersonLookupUrl,
} from './pure/analytics.ts';

// Deletes the PostHog person (and events) of a deleted account. Needs the function secrets
// POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID (POSTHOG_HOST optional); without them, nothing.
export async function deletePosthogPerson(userId: string): Promise<void> {
  const key = Deno.env.get('POSTHOG_PERSONAL_API_KEY');
  const projectId = Deno.env.get('POSTHOG_PROJECT_ID');
  if (!key || !projectId) return;
  const host = Deno.env.get('POSTHOG_HOST') ?? POSTHOG_DEFAULT_API_HOST;
  const headers = { authorization: `Bearer ${key}` };

  const lookup = await fetch(posthogPersonLookupUrl(host, projectId, userId), {
    headers,
    signal: AbortSignal.timeout(5000),
  });
  if (!lookup.ok) throw new Error(`posthog lookup failed (${lookup.status})`);
  for (const personId of posthogPersonIds(await lookup.json())) {
    const res = await fetch(posthogPersonDeleteUrl(host, projectId, personId), {
      method: 'DELETE',
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`posthog delete failed (${res.status})`);
  }
}
