import { Ionicons } from '@expo/vector-icons';
import { type ActivityBucket, describeEventTime } from '@shared/explore.ts';
import { View } from 'react-native';

import { ListRow } from '@/components/ListRow';
import { Tag, type TagVariant } from '@/components/Tag';
import { tr } from '@/i18n/tr';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, TOUCH } from '@/theme/tokens';

import type { ExploreEvent, ExploreVenue } from './useExploreVenues';

// Bucket → tag colours, shared by the list tag and the map marker.
export const BUCKET_TAG: Record<ActivityBucket, 'calm' | 'lively' | 'buzz'> = {
  calm: 'calm',
  lively: 'lively',
  buzzing: 'buzz',
};

export function BucketBadge({ bucket }: { bucket: ActivityBucket }) {
  const variant: TagVariant = BUCKET_TAG[bucket];
  return <Tag variant={variant} label={tr.explore.buckets[bucket]} />;
}

export function EventTag({ event }: { event: NonNullable<ExploreVenue['event']> }) {
  const now = useNow(60_000);
  const when = describeEventTime(event.startsAt, event.endsAt, now);
  return (
    <Tag
      variant="event"
      icon="sparkles-outline"
      label={tr.explore.eventTag(tr.explore.eventTime(when), event.title)}
    />
  );
}

// One event in the single-venue Keşfet (canvas: Etkinlikler): a calendar tile, the title and when.
// The tile is in the event colour while the event is on.
export function EventRow({ event }: { event: ExploreEvent }) {
  const { colors, shape } = useTheme();
  const now = useNow(60_000);
  const when = describeEventTime(event.startsAt, event.endsAt, now);
  const on = when.kind === 'now';
  return (
    <ListRow
      title={event.title}
      meta={tr.explore.eventTime(when)}
      leading={
        <View
          className="items-center justify-center"
          style={{
            width: TOUCH.min,
            height: TOUCH.min,
            borderRadius: shape.radius.sm,
            backgroundColor: on ? colors.event : colors.surface2,
          }}
        >
          <Ionicons
            name="calendar-outline"
            size={ICON.md}
            color={on ? colors.onEvent : colors.text}
          />
        </View>
      }
    />
  );
}
