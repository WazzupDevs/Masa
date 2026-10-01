import type { Participation } from '@shared/profile.ts';

import { tr } from '@/i18n/tr';

// The hint under "Anonim" / "Profilimle", chosen for each room (docs/SPEC_V3.md §5.4).
export function participationHint(mode: Participation, hasName: boolean): string {
  if (mode === 'anonymous') return tr.participation.anonymousHint;
  return hasName ? tr.participation.profileHint : tr.participation.profileNeedsName;
}
