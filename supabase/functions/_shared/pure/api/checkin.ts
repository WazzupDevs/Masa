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
  // Where the table is at a venue with spots (docs/SPEC_V3.md §4.3); required there, absent
  // elsewhere.
  spotId?: string;
};

// "Bu noktadayım": no new position; refused in a room or with a request out (`in_room`).
export type ChangeSpotRequest = { action: 'change-spot'; spotId: string };

// "Masa adını değiştir" (docs/SPEC_V3.md §5.6): not in a room, at most 3 times per check-in.
export type RerollAliasRequest = { action: 'reroll-alias' };

export type LeaveRequest = { action: 'leave' };

export type CheckinRequest = CheckInRequest | ChangeSpotRequest | RerollAliasRequest | LeaveRequest;

export type CheckInResponse = { sessionId: string; alias: string; expiresAt: string };

export type ChangeSpotResponse = { spotId: string };

export type RerollAliasResponse = { alias: string; rerollsLeft: number };

export type LeaveResponse = { ok: true };
