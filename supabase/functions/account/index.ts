import { requireUser, serviceClient } from '../_shared/auth.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import type { AccountRequest, AccountResponse } from '../_shared/pure/api/account.ts';
import { CURRENT_KVKK_VERSION, CURRENT_TERMS_VERSION } from '../_shared/pure/consent.ts';
import { AppError } from '../_shared/pure/errors.ts';

const Body: z.ZodType<AccountRequest> = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('complete-onboarding'),
    ageConfirmed: z.literal(true),
    termsVersion: z.string(),
    kvkkVersion: z.string(),
  }),
  z.object({ action: z.literal('delete') }),
]);

const db = serviceClient();

Deno.serve(
  handle(async (req, raw): Promise<AccountResponse> => {
    const body = Body.parse(raw);

    switch (body.action) {
      case 'complete-onboarding': {
        const user = await requireUser(req, db);
        if (
          body.termsVersion !== CURRENT_TERMS_VERSION ||
          body.kvkkVersion !== CURRENT_KVKK_VERSION
        ) {
          throw new AppError('consent_outdated', 'Accepted texts are not the current versions.');
        }
        const now = new Date().toISOString();
        const { error } = await db.from('profiles').upsert({
          id: user.id,
          age_confirmed_at: now,
          terms_accepted_at: now,
          terms_version: body.termsVersion,
          kvkk_accepted_at: now,
          kvkk_version: body.kvkkVersion,
        });
        if (error) throw error;
        return { ok: true };
      }

      case 'delete': {
        const user = await requireUser(req, db);
        const { error } = await db.auth.admin.deleteUser(user.id);
        if (error) throw error;
        return { ok: true };
      }
    }
  }),
);
