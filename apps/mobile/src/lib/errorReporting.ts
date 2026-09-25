import { scrubBreadcrumb, scrubEvent } from '@shared/errorReporting.ts';
import * as Sentry from '@sentry/react-native';

// Crash reporting (Sentry). Without EXPO_PUBLIC_SENTRY_DSN every call does nothing. The only
// identity sent is the user id; @shared/errorReporting.ts strips phone numbers, coordinates,
// typed text, request bodies and query strings before anything leaves the phone.
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initErrorReporting(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
}

export function setReportingUser(userId: string | null): void {
  if (!dsn) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

export function reportError(error: unknown): void {
  if (!dsn) return;
  Sentry.captureException(error);
}
