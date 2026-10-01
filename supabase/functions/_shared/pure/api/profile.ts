import type { BadgeId } from '../badges.ts';

// `profile` Edge Function (docs/SPEC_V2.md §5), shared with the mobile app.
export type ProfileView = {
  publicId: string;
  displayName: string | null;
  bio: string | null;
  // Signed URL valid for an hour; null without a photo or when it is hidden.
  photoUrl: string | null;
  badges: BadgeId[];
  // Completed years (Istanbul day); the birth date itself goes to nobody else (rule 11).
  age: number | null;
  // Only on the caller's own profile.
  photoHidden?: boolean;
  birthDate?: string | null;
};

// The profile behind a profiled venue chat message (docs/SPEC_V3.md §7.5): no public_id; it opens
// through the message only.
export type ChatProfileView = Omit<ProfileView, 'publicId' | 'photoHidden' | 'birthDate'>;

export type ProfileRequest =
  | { action: 'get'; publicId: string }
  // No live table at the venue, an anonymous, hidden or deleted message, a block either way and an
  // unknown id all answer not_found alike.
  | { action: 'get'; venueChatMessageId: string }
  | {
      action: 'update';
      displayName?: string;
      bio?: string;
      notifyDm?: boolean;
      notifyFriendRequests?: boolean;
    }
  | { action: 'photo-upload-url' }
  | { action: 'photo-commit'; path: string }
  | { action: 'photo-remove' };

export type ProfileUploadUrl = { path: string; token: string };
export type ProfileResponse = ProfileView | ChatProfileView | ProfileUploadUrl | { ok: true };
