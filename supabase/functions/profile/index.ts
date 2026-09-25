// Profiles (docs/SPEC_V2.md §5). `get` returns a profile only to the owner, friends and current
// room members of a table that joined with its profile; every other case answers exactly like an
// unknown public_id. Photos are re-encoded and stripped of metadata on the phone and checked here
// again before they count (rule 6).
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import { loadProfanity } from '../_shared/profanity.ts';
import type { ProfileRequest, ProfileResponse, ProfileView } from '../_shared/pure/api/profile.ts';
import { earnedBadges } from '../_shared/pure/badges.ts';
import { AppError } from '../_shared/pure/errors.ts';
import { inspectJpeg } from '../_shared/pure/jpegMetadata.ts';
import {
  checkBio,
  checkDisplayName,
  isOwnPhotoPath,
  PARTICIPATIONS,
  PHOTO_BUCKET,
  PHOTO_MAX_BYTES,
  PHOTO_URL_SECONDS,
} from '../_shared/pure/profile.ts';

const Body: z.ZodType<ProfileRequest> = z.discriminatedUnion('action', [
  z.object({ action: z.literal('get'), publicId: z.uuid() }),
  z.object({
    action: z.literal('update'),
    displayName: z.string().max(200).optional(),
    bio: z.string().max(2000).optional(),
    defaultParticipation: z.enum(PARTICIPATIONS).optional(),
    notifyDm: z.boolean().optional(),
    notifyFriendRequests: z.boolean().optional(),
  }),
  z.object({ action: z.literal('photo-upload-url') }),
  z.object({ action: z.literal('photo-commit'), path: z.string().max(200) }),
  z.object({ action: z.literal('photo-remove') }),
]);

const db = serviceClient();
const photos = () => db.storage.from(PHOTO_BUCKET);

async function ownProfile(userId: string) {
  const { data, error } = await db
    .from('profiles')
    .select('public_id, display_name, photo_path')
    .eq('id', userId)
    .single();
  if (error) throw dbError('profiles', error);
  return data;
}

function requireName(displayName: string | null): void {
  if (!displayName) throw new AppError('display_name_required', 'Choose a display name first.');
}

async function getProfile(viewer: string, publicId: string): Promise<ProfileView> {
  const { data, error } = await db.rpc('profile_view', {
    viewer,
    target_public_id: publicId,
  });
  if (error) throw dbError('profile_view', error);
  const row = data[0];
  // Unknown, blocked, or not allowed: the same answer on the same path.
  if (!row) throw new AppError('not_found', 'Profile not found.');

  const stats = await db.rpc('user_stats', { target_user_id: row.user_id });
  if (stats.error) throw dbError('user_stats', stats.error);
  const counts = stats.data[0];

  let photoUrl: string | null = null;
  if (row.photo_path && !row.photo_hidden) {
    const signed = await photos().createSignedUrl(row.photo_path, PHOTO_URL_SECONDS);
    if (signed.error) throw new Error(`storage sign failed (${signed.error.message})`);
    photoUrl = signed.data.signedUrl;
  }
  return {
    publicId: row.public_id,
    displayName: row.display_name,
    bio: row.bio,
    photoUrl,
    badges: earnedBadges({
      games: counts?.games ?? 0,
      voiceTabuWins: counts?.voice_tabu_wins ?? 0,
      distinctTables: counts?.distinct_tables ?? 0,
    }),
    ...(row.is_self ? { photoHidden: row.photo_hidden } : {}),
  };
}

Deno.serve(
  handle(async (req, raw): Promise<ProfileResponse> => {
    const body = Body.parse(raw);
    const user = await requireUser(req, db);

    switch (body.action) {
      case 'get':
        return await getProfile(user.id, body.publicId);

      case 'update': {
        const me = await ownProfile(user.id);
        const terms = await loadProfanity(db);
        const changes: {
          display_name?: string;
          bio?: string | null;
          default_participation?: 'anonymous' | 'profile';
          notify_dm?: boolean;
          notify_friend_requests?: boolean;
        } = {};
        let name = me.display_name;

        if (body.displayName !== undefined) {
          const checked = checkDisplayName(body.displayName, terms);
          if (!checked.ok || checked.value === null) {
            throw new AppError('display_name_invalid', 'Invalid display name.');
          }
          changes.display_name = checked.value;
          name = checked.value;
        }
        if (body.bio !== undefined) {
          const checked = checkBio(body.bio, terms);
          if (!checked.ok) throw new AppError('bio_invalid', 'Invalid bio.');
          if (checked.value !== null) requireName(name);
          changes.bio = checked.value;
        }
        if (body.defaultParticipation !== undefined) {
          if (body.defaultParticipation === 'profile') requireName(name);
          changes.default_participation = body.defaultParticipation;
        }
        if (body.notifyDm !== undefined) changes.notify_dm = body.notifyDm;
        if (body.notifyFriendRequests !== undefined) {
          changes.notify_friend_requests = body.notifyFriendRequests;
        }

        if (Object.keys(changes).length === 0) return { ok: true };
        const { error } = await db.from('profiles').update(changes).eq('id', user.id);
        if (error) throw dbError('profiles', error);
        return { ok: true };
      }

      case 'photo-upload-url': {
        const me = await ownProfile(user.id);
        requireName(me.display_name);
        const path = `${me.public_id}/${crypto.randomUUID()}.jpg`;
        const { data, error } = await photos().createSignedUploadUrl(path);
        if (error) throw new Error(`storage upload url failed (${error.message})`);
        return { path, token: data.token };
      }

      case 'photo-commit': {
        const me = await ownProfile(user.id);
        requireName(me.display_name);
        // Re-committing the current path would clear a hide after reports; only a new photo does.
        if (!isOwnPhotoPath(body.path, me.public_id) || body.path === me.photo_path) {
          throw new AppError('photo_invalid', 'Not a new photo of yours.');
        }
        const file = await photos().download(body.path);
        if (file.error) throw new AppError('photo_invalid', 'Photo not uploaded.');
        const bytes = new Uint8Array(await file.data.arrayBuffer());
        if (bytes.length > PHOTO_MAX_BYTES || !inspectJpeg(bytes).ok) {
          await photos().remove([body.path]);
          throw new AppError('photo_invalid', 'Only JPEG without metadata is accepted.');
        }
        const { error } = await db
          .from('profiles')
          .update({ photo_path: body.path, photo_hidden_at: null })
          .eq('id', user.id);
        if (error) throw dbError('profiles', error);
        if (me.photo_path && me.photo_path !== body.path) await photos().remove([me.photo_path]);
        return { ok: true };
      }

      case 'photo-remove': {
        const me = await ownProfile(user.id);
        if (me.photo_path) await photos().remove([me.photo_path]);
        const { error } = await db
          .from('profiles')
          .update({ photo_path: null, photo_hidden_at: null })
          .eq('id', user.id);
        if (error) throw dbError('profiles', error);
        return { ok: true };
      }
    }
  }),
);
