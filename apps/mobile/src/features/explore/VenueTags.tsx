import { Ionicons } from '@expo/vector-icons';
import { type ActivityBucket, describeEventTime } from '@shared/explore.ts';
import type { VenueKind } from '@shared/venueKind.ts';
import { View } from 'react-native';

import { KindIcon } from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { LiveDot } from '@/components/LiveDot';
import { Tag, type TagVariant } from '@/components/Tag';
import { tr } from '@/i18n/tr';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, type PaletteKey, SPACING, TOUCH } from '@/theme/tokens';

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

// How lively a venue is, as a beating dot on the Keşfet list (canvas: Aşama 8 · Saha → Keşfet):
// calm blue and slow, lively green, buzzing red and fast. The reader hears the bucket's name.
const LIVENESS: Record<ActivityBucket, { tone: PaletteKey; periodMs: number }> = {
  calm: { tone: 'read', periodMs: 2400 },
  lively: { tone: 'success', periodMs: 1400 },
  buzzing: { tone: 'danger', periodMs: 800 },
};

export function LivenessDot({ bucket }: { bucket: ActivityBucket }) {
  const { tone, periodMs } = LIVENESS[bucket];
  return (
    <LiveDot
      tone={tone}
      periodMs={periodMs}
      size={SPACING[2.5]}
      accessibilityLabel={tr.explore.buckets[bucket]}
    />
  );
}

// A venue's picture in the list: its kind (a cup, a faculty building; the map marker drawings) on a
// tile.
export function VenueTile({ kind }: { kind: VenueKind }) {
  const { colors, shape } = useTheme();
  const [bg, fg] =
    kind === 'campus' ? [colors.calm, colors.onCalm] : [colors.surface2, colors.text];
  return (
    <View
      className="items-center justify-center"
      style={{
        width: SPACING[14],
        height: SPACING[14],
        borderRadius: shape.radius.md,
        backgroundColor: bg,
      }}
    >
      <KindIcon kind={kind} color={fg} size={SPACING[8]} />
    </View>
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
      card
      title={event.title}
      meta={tr.explore.eventTime(when)}
      leading={
        <View
          className="items-center justify-center"
          style={{
            width: TOUCH.button,
            height: TOUCH.button,
            borderRadius: shape.radius.pill,
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
