import { Text } from 'react-native';

import { tr } from '@/i18n/tr';

// A table that joined with its profile shows only this flag in the lobby and in the owner's request window (docs/SPEC_V2.md §5.4).
export function ProfiledTag() {
  return (
    <Text className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-700">
      {tr.rooms.profiled}
    </Text>
  );
}
