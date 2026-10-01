import type { ProfileView } from '@shared/api/profile.ts';
import { BADGES, type BadgeId } from '@shared/badges.ts';
import type { ReactNode } from 'react';
import { Image, type ImageSourcePropType, View } from 'react-native';

import { Card } from '@/components/Card';
import { ProfilePhoto } from '@/components/ProfilePhoto';
import { Snail } from '@/components/Snail';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import type { Palette } from '@/theme/tokens';
import { SPACING } from '@/theme/tokens';

type Profile = Pick<ProfileView, 'photoUrl' | 'displayName' | 'age' | 'bio' | 'badges'>;

// The photo area of another person's card.
const HERO_HEIGHT = SPACING[16] * 4;
const BADGE = SPACING[16];
const BADGE_GLYPH = SPACING[8];
const LOCK = SPACING[5];

function nameLine(profile: Profile): string {
  return profile.displayName
    ? profile.age !== null
      ? tr.profile.nameWithAge(profile.displayName, profile.age)
      : profile.displayName
    : tr.profile.noName;
}

// The own profile (canvas: Aşama 5 · Geri bildirim → Profil): the photo, the name with the age
// (never the birth date, rule 11) and the bio, centred on the canvas, then the actions.
export function OwnProfileHead({ profile, children }: { profile: Profile; children: ReactNode }) {
  return (
    <View className="items-center gap-3">
      <ProfilePhoto url={profile.photoUrl} name={profile.displayName} />
      <View className="items-center gap-1">
        <Text variant="alias" align="center">
          {nameLine(profile)}
        </Text>
        {profile.bio ? (
          <Text tone="muted" align="center">
            {profile.bio}
          </Text>
        ) : null}
      </View>
      <View className="self-stretch">{children}</View>
    </View>
  );
}

// Another person's profile (canvas: Profil kartı): the photo across the top (or the initials on the
// violet), then the name with the age and the bio. Also the venue chat sender's card
// (ChatProfileView), which has no public_id.
export function ProfileHero({ profile, overlay }: { profile: Profile; overlay?: ReactNode }) {
  const { colors, shape } = useTheme();
  const letters = (profile.displayName ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toLocaleUpperCase('tr-TR') ?? '')
    .join('');
  return (
    <View className="gap-4">
      <View
        className="items-center justify-center overflow-hidden"
        style={{
          height: HERO_HEIGHT,
          marginHorizontal: -shape.screenPadding,
          marginTop: -SPACING[3],
          backgroundColor: profile.photoUrl ? colors.surface2 : colors.violet,
        }}
      >
        {profile.photoUrl ? (
          <Image
            source={{ uri: profile.photoUrl }}
            accessibilityIgnoresInvertColors
            resizeMode="cover"
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
        ) : letters ? (
          <Text variant="score" tone="onViolet">
            {letters}
          </Text>
        ) : (
          <Snail variant="ink" height={SPACING[16] + SPACING[8]} />
        )}
        {overlay ? (
          <View style={{ position: 'absolute', top: SPACING[3], left: SPACING[3] }}>{overlay}</View>
        ) : null}
      </View>
      <View className="gap-1">
        <Text variant="alias" accessibilityRole="header">
          {nameLine(profile)}
        </Text>
        {profile.bio ? <Text tone="muted">{profile.bio}</Text> : null}
      </View>
    </View>
  );
}

// Each badge's icon (scripts/icon/glyphs.ts → BADGE_GLYPHS) and colour (canvas: Rozetler).
const BADGE_LOOK: Record<
  BadgeId,
  { icon: ImageSourcePropType; tone: readonly [keyof Palette, keyof Palette] }
> = {
  first_game: {
    icon: require('../../../assets/glyph/badge-first_game.png'),
    tone: ['buzz', 'onBuzz'],
  },
  ten_games: {
    icon: require('../../../assets/glyph/badge-ten_games.png'),
    tone: ['calm', 'onCalm'],
  },
  voice_tabu_five_wins: {
    icon: require('../../../assets/glyph/badge-voice_tabu_five_wins.png'),
    tone: ['lively', 'onLively'],
  },
  five_tables: {
    icon: require('../../../assets/glyph/badge-five_tables.png'),
    tone: ['violet', 'onViolet'],
  },
};
const LOCK_ICON: ImageSourcePropType = require('../../../assets/glyph/lock.png');

// One badge: its icon on its own colour when earned; a quiet disc, a faint icon and a lock when not.
export function BadgeIcon({ badge, earned }: { badge: BadgeId; earned: boolean }) {
  const { colors, shape } = useTheme();
  const look = BADGE_LOOK[badge];
  const [bg, fg] = earned
    ? [colors[look.tone[0]], colors[look.tone[1]]]
    : [colors.surface2, colors.muted];
  return (
    <View
      className="items-center justify-center"
      style={{ width: BADGE, height: BADGE, borderRadius: shape.radius.pill, backgroundColor: bg }}
    >
      <Image
        source={look.icon}
        accessible={false}
        style={{
          width: BADGE_GLYPH,
          height: BADGE_GLYPH,
          tintColor: fg,
          opacity: earned ? 1 : 0.6,
        }}
      />
      {earned ? null : (
        <View
          className="absolute items-center justify-center"
          style={{
            right: 0,
            bottom: 0,
            width: LOCK + SPACING[1],
            height: LOCK + SPACING[1],
            borderRadius: shape.radius.pill,
            backgroundColor: colors.surface,
          }}
        >
          <Image
            source={LOCK_ICON}
            accessible={false}
            style={{
              width: LOCK - SPACING[1.5],
              height: LOCK - SPACING[1.5],
              tintColor: colors.muted,
            }}
          />
        </View>
      )}
    </View>
  );
}

// Badges as round tiles. `all`: the own profile shows every badge, the locked ones quiet; another
// person's card shows only what they earned, or the snail and "Oynadıkça rozet kazanırsın".
export function Badges({ badges, all = false }: { badges: readonly BadgeId[]; all?: boolean }) {
  if (badges.length === 0 && !all) {
    return (
      <Card>
        <View className="flex-row items-center gap-3">
          <Snail height={SPACING[11]} />
          <Text className="flex-1">{tr.profile.noBadges}</Text>
        </View>
      </Card>
    );
  }
  const shown = all ? BADGES.map((b) => b.id) : badges;
  return (
    <View className="flex-row flex-wrap gap-y-4">
      {shown.map((badge) => {
        const earned = badges.includes(badge);
        return (
          <View
            key={badge}
            className="items-center gap-2"
            style={{ width: '25%' }}
            accessible
            accessibilityLabel={
              earned ? tr.profile.badges[badge] : tr.profile.badgeLocked(tr.profile.badges[badge])
            }
          >
            <BadgeIcon badge={badge} earned={earned} />
            <Text variant="label" tone={earned ? 'text' : 'muted'} align="center">
              {tr.profile.badges[badge]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
