import type { BadgeId } from '../badges.ts';
import type { Participation } from '../profile.ts';

// `profile` Edge Function (docs/SPEC_V2.md §5), shared with the mobile app.
export type ProfileView = {
  publicId: string;
  displayName: string | null;
  bio: string | null;
  // Signed URL valid for an hour; null without a photo or when it is hidden.
  photoUrl: string | null;
  badges: BadgeId[];
  // Only on the caller's own profile.
  photoHidden?: boolean;
};

export type ProfileRequest =
  | { action: 'get'; publicId: string }
  | {
      action: 'update';
      displayName?: string;
      bio?: string;
      defaultParticipation?: Participation;
      notifyDm?: boolean;
      notifyFriendRequests?: boolean;
    }
  | { action: 'photo-upload-url' }
  | { action: 'photo-commit'; path: string }
  | { action: 'photo-remove' };

export type ProfileUploadUrl = { path: string; token: string };
export type ProfileResponse = ProfileView | ProfileUploadUrl | { ok: true };
