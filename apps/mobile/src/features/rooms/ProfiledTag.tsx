import { Tag } from '@/components/Tag';
import { tr } from '@/i18n/tr';

// A table that joined with its profile shows only this flag in the lobby and in the owner's request window (docs/SPEC_V2.md §5.4).
export function ProfiledTag() {
  return <Tag variant="profiled" label={tr.rooms.profiled} />;
}
