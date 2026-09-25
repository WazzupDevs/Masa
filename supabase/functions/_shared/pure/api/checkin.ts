import type { Participation } from '../profile.ts';

// Request and response shapes of the `checkin` Edge Function, shared with the mobile app.
export type CheckInRequest = {
  action: 'check-in';
  venueId: string;
  lat: number;
  lng: number;
  // Accuracy radius reported by the device, in metres. Stored; the coordinates are not.
  accuracyM: number | null;
  // 1–4; 4 means "4+".
  headcount: number;
  locationConsentVersion: string;
  // For this table only; the profile's default_participation when omitted. `profile` needs a
  // display name.
  participation?: Participation;
};

export type LeaveRequest = { action: 'leave' };

export type CheckinRequest = CheckInRequest | LeaveRequest;

export type CheckInResponse = { sessionId: string; alias: string; expiresAt: string };

export type LeaveResponse = { ok: true };
