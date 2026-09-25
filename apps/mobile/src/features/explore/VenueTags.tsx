import { type ActivityBucket, describeEventTime } from '@shared/explore.ts';
import { Text, View } from 'react-native';

import { tr } from '@/i18n/tr';
import { useNow } from '@/lib/useNow';

import type { ExploreVenue } from './useExploreVenues';

// Colours per bucket, shared by the list badge and the map marker.
export const BUCKET_COLOR: Record<ActivityBucket, string> = {
  calm: '#a3a3a3',
  lively: '#f59e0b',
  buzzing: '#dc2626',
};

export function BucketBadge({ bucket }: { bucket: ActivityBucket }) {
  return (
    <View className="flex-row items-center gap-1">
      <View
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: BUCKET_COLOR[bucket] }}
      />
      <Text className="text-xs text-neutral-600">{tr.explore.buckets[bucket]}</Text>
    </View>
  );
}

export function EventTag({ event }: { event: NonNullable<ExploreVenue['event']> }) {
  const now = useNow(60_000);
  const when = describeEventTime(event.startsAt, event.endsAt, now);
  return (
    <View className="self-start rounded-full bg-violet-100 px-2 py-0.5">
      <Text className="text-xs font-semibold text-violet-800">
        {tr.explore.eventTag(tr.explore.eventTime(when), event.title)}
      </Text>
    </View>
  );
}
