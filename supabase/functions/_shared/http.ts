import { z } from './deps.ts';
import { AppError, type ErrorCode, toErrorBody } from './pure/errors.ts';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  consent_outdated: 409,
  onboarding_required: 403,
  venue_not_found: 404,
  too_far: 403,
  alias_exhausted: 409,
  unauthorized: 401,
  method_not_allowed: 405,
  internal: 500,
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function errorResponse(code: ErrorCode, message: string): Response {
  return json(toErrorBody(code, message), STATUS[code]);
}

// Wraps a handler: POST + JSON only, and every failure leaves as `{ error: { code, message } }`.
export function handle(fn: (req: Request, body: unknown) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') {
      return errorResponse('method_not_allowed', 'Only POST is supported.');
    }
    try {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw new AppError('bad_request', 'Body must be JSON.');
      }
      return json(await fn(req, body));
    } catch (err) {
      if (err instanceof AppError) return errorResponse(err.code, err.message);
      if (err instanceof z.ZodError) return errorResponse('bad_request', 'Invalid request.');
      console.error(err);
      return errorResponse('internal', 'Unexpected error.');
    }
  };
}
