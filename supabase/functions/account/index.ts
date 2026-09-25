import { requireUser, serviceClient } from '../_shared/auth.ts';
import { inBackground } from '../_shared/background.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import { deleteProfilePhotos } from '../_shared/photos.ts';
import { deletePosthogPerson } from '../_shared/posthog.ts';
import type { AccountRequest, AccountResponse } from '../_shared/pure/api/account.ts';
import { CURRENT_KVKK_VERSION, CURRENT_TERMS_VERSION } from '../_shared/pure/consent.ts';
import { AppError } from '../_shared/pure/errors.ts';
import { isExpoPushToken } from '../_shared/pure/push.ts';

const Body: z.ZodType<AccountRequest> = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('complete-onboarding'),
    ageConfirmed: z.literal(true),
    termsVersion: z.string(),
    kvkkVersion: z.string(),
  }),
  z.object({ action: z.literal('delete') }),
  z.object({
    action: z.literal('register-push'),
    token: z.string().max(200).refine(isExpoPushToken).nullable(),
  }),
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
        // End the table first so its rooms close or go back to waiting for the other table.
        const ended = await db.rpc('end_table_session', { target_user_id: user.id });
        if (ended.error) throw dbError('end_table_session', ended.error);
        // Photos before the account: the profile row holds the folder name.
        const profile = await db
          .from('profiles')
          .select('public_id')
          .eq('id', user.id)
          .maybeSingle();
        if (profile.error) throw dbError('profiles', profile.error);
        if (profile.data) await deleteProfilePhotos(db, profile.data.public_id);
        const { error } = await db.auth.admin.deleteUser(user.id);
        if (error) throw error;
        inBackground(deletePosthogPerson(user.id));
        return { ok: true };
      }

      case 'register-push': {
        const user = await requireUser(req, db);
        const { error } = await db
          .from('profiles')
          .update({ push_token: body.token })
          .eq('id', user.id);
        if (error) throw dbError('profiles', error);
        return { ok: true };
      }
    }
  }),
);
