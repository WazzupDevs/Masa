// What may leave the phone in a crash report (Sentry). Only the user id identifies the person;
// phone numbers, coordinates and message content never do. Structural types, so the mobile app
// can pass Sentry's event and breadcrumb objects without this module depending on Sentry.

export type ReportBreadcrumb = {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
};

export type ReportEvent = {
  user?: Record<string, unknown>;
  request?: unknown;
  extra?: unknown;
  message?: string;
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: ReportBreadcrumb[];
};

// Turkish mobile numbers in any common spelling (+90 5xx xxx xx xx, 905xxxxxxxxx, 05xx…) and
// decimal coordinate pairs ("41.0012, 28.6421").
const PHONE = /(?<![\d.])(?:(?:\+?90|0)[\s-]?)?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/g;
const COORDINATES = /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g;

export function redact(text: string): string {
  return text.replace(COORDINATES, '[konum]').replace(PHONE, '[telefon]');
}

// Breadcrumbs that may carry typed text or logged values are dropped; network crumbs keep only
// method, status and the URL without its query string.
const DROPPED_CATEGORIES = new Set(['console', 'ui.input']);

export function scrubBreadcrumb<B extends ReportBreadcrumb>(crumb: B): B | null {
  if (crumb.category && DROPPED_CATEGORIES.has(crumb.category)) return null;
  const scrubbed: B = { ...crumb };
  if (crumb.message !== undefined) scrubbed.message = redact(crumb.message);
  if (crumb.data) {
    const { method, status_code: statusCode, url } = crumb.data;
    scrubbed.data = {
      ...(typeof method === 'string' ? { method } : {}),
      ...(typeof statusCode === 'number' ? { status_code: statusCode } : {}),
      ...(typeof url === 'string' ? { url: url.split('?')[0] } : {}),
    };
  }
  return scrubbed;
}

export function scrubEvent<E extends ReportEvent>(event: E): E {
  const scrubbed: E = { ...event };
  const id = event.user?.id;
  scrubbed.user = typeof id === 'string' ? { id } : undefined;
  delete scrubbed.request;
  delete scrubbed.extra;
  if (event.message !== undefined) scrubbed.message = redact(event.message);
  if (event.exception?.values) {
    scrubbed.exception = {
      ...event.exception,
      values: event.exception.values.map((v) =>
        v.value === undefined ? v : { ...v, value: redact(v.value) },
      ),
    };
  }
  if (event.breadcrumbs) {
    scrubbed.breadcrumbs = event.breadcrumbs
      .map((b) => scrubBreadcrumb(b))
      .filter((b): b is NonNullable<typeof b> => b !== null);
  }
  return scrubbed;
}
