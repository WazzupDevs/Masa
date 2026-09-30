import { requireUser, serviceClient } from '../_shared/auth.ts';
import { inBackground } from '../_shared/background.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import { deleteProfilePhotos } from '../_shared/photos.ts';
import { deletePosthogPerson } from '../_shared/posthog.ts';
import { checkBirthDate, isAdult, istanbulToday } from '../_shared/pure/age.ts';
import type {
  AccountRequest,
  AccountResponse,
  CompleteOnboardingRequest,
} from '../_shared/pure/api/account.ts';
import { CURRENT_KVKK_VERSION, CURRENT_TERMS_VERSION } from '../_shared/pure/consent.ts';
import { AppError } from '../_shared/pure/errors.ts';
import { checkDisplayName } from '../_shared/pure/profile.ts';
import { loadProfanity } from '../_shared/profanity.ts';
import { isExpoPushToken } from '../_shared/pure/push.ts';

const Body: z.ZodType<AccountRequest> = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('complete-onboarding'),
    termsVersion: z.string(),
    kvkkVersion: z.string(),
    displayName: z.string().max(200).optional(),
    birthDate: z.string().max(20).optional(),
  }),
  z.object({ action: z.literal('delete') }),
  z.object({
    action: z.literal('register-push'),
    token: z.string().max(200).refine(isExpoPushToken).nullable(),
  }),
]);

const db = serviceClient();

// "Hesabımı sil", and sign-up under 18: end the table, delete the photos, delete the account (the
// rest goes by cascade), then the PostHog person.
async function deleteAccount(userId: string): Promise<void> {
  // End the table first so its rooms close or go back to waiting for the other table.
  const ended = await db.rpc('end_table_session', { target_user_id: userId });
  if (ended.error) throw dbError('end_table_session', ended.error);
  // Photos before the account: the profile row holds the folder name.
  const profile = await db.from('profiles').select('public_id').eq('id', userId).maybeSingle();
  if (profile.error) throw dbError('profiles', profile.error);
  if (profile.data) await deleteProfilePhotos(db, profile.data.public_id);
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw error;
  inBackground(deletePosthogPerson(userId));
}

// Consents and the profile in one write (docs/SPEC_V3.md §3). The age is checked before anything
// is written: under 18 the account is deleted and nothing about the person is kept.
async function completeOnboarding(userId: string, body: CompleteOnboardingRequest): Promise<void> {
  if (body.termsVersion !== CURRENT_TERMS_VERSION || body.kvkkVersion !== CURRENT_KVKK_VERSION) {
    throw new AppError('consent_outdated', 'Accepted texts are not the current versions.');
  }
  const existing = await db
    .from('profiles')
    .select('display_name, birth_date')
    .eq('id', userId)
    .maybeSingle();
  if (existing.error) throw dbError('profiles', existing.error);

  let birthDate = existing.data?.birth_date ?? null;
  if (birthDate === null) {
    if (body.birthDate === undefined) {
      throw new AppError('profile_required', 'A birth date is required.');
    }
    const checked = checkBirthDate(body.birthDate, istanbulToday(new Date()));
    if (!checked.ok) throw new AppError('birth_date_invalid', 'Invalid birth date.');
    if (!isAdult(checked.age)) {
      await deleteAccount(userId);
      throw new AppError('under_age', 'Kabuk is for 18 and over.');
    }
    birthDate = checked.value;
  } else if (body.birthDate !== undefined && body.birthDate !== birthDate) {
    // Set once; a correction goes through admin:set-birth-date.
    throw new AppError('birth_date_invalid', 'The birth date cannot be changed.');
  }

  let displayName = existing.data?.display_name ?? null;
  if (body.displayName !== undefined) {
    const checked = checkDisplayName(body.displayName, await loadProfanity(db));
    if (!checked.ok || checked.value === null) {
      throw new AppError('display_name_invalid', 'Invalid display name.');
    }
    displayName = checked.value;
  }
  if (displayName === null) throw new AppError('profile_required', 'A display name is required.');

  const now = new Date().toISOString();
  const { error } = await db.from('profiles').upsert({
    id: userId,
    age_confirmed_at: now,
    terms_accepted_at: now,
    terms_version: body.termsVersion,
    kvkk_accepted_at: now,
    kvkk_version: body.kvkkVersion,
    display_name: displayName,
    birth_date: birthDate,
  });
  if (error) throw dbError('profiles', error);
}

Deno.serve(
  handle(async (req, raw): Promise<AccountResponse> => {
    const body = Body.parse(raw);

    switch (body.action) {
      case 'complete-onboarding': {
        const user = await requireUser(req, db);
        await completeOnboarding(user.id, body);
        return { ok: true };
      }

      case 'delete': {
        const user = await requireUser(req, db);
        await deleteAccount(user.id);
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
