import {
  type AnalyticsEvent,
  type AnalyticsEventProps,
  analyticsProperties,
} from '@shared/analytics.ts';
import PostHog from 'posthog-react-native';

// PostHog (MVP_SPEC §12). Without EXPO_PUBLIC_POSTHOG_KEY every call does nothing. The distinct id
// is the user id and nothing else about the person is sent: no phone, no alias, no location, no
// GeoIP, no session replay.
const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

let client: PostHog | null = null;

function posthog(): PostHog | null {
  if (!apiKey) return null;
  client ??= new PostHog(apiKey, {
    host,
    disableGeoip: true,
    personProfiles: 'identified_only',
    captureAppLifecycleEvents: false,
    enableSessionReplay: false,
  });
  return client;
}

export function track<E extends AnalyticsEvent>(event: E, props: AnalyticsEventProps[E]): void {
  posthog()?.capture(event, analyticsProperties(event, props));
}

export function identify(userId: string): void {
  posthog()?.identify(userId);
}

export function resetAnalytics(): void {
  posthog()?.reset();
}

// For events derived from state the screen may see more than once (a status change, a result
// screen): sends each key once per app run.
const sent = new Set<string>();

export function trackOnce<E extends AnalyticsEvent>(
  key: string,
  event: E,
  props: AnalyticsEventProps[E],
): void {
  if (sent.has(key)) return;
  sent.add(key);
  track(event, props);
}
