import type { ProfileView } from '@shared/api/profile.ts';
import type { BadgeId } from '@shared/badges.ts';
import type { ReactNode } from 'react';
import { Image, View } from 'react-native';

import { Card } from '@/components/Card';
import { ProfilePhoto } from '@/components/ProfilePhoto';
import { Snail, SnailLineIcon } from '@/components/Snail';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING } from '@/theme/tokens';

type Profile = Pick<ProfileView, 'photoUrl' | 'displayName' | 'age' | 'bio' | 'badges'>;

// The colour block of the own profile card and the photo area of another person's card.
const BLOCK_HEIGHT = SPACING[16] + SPACING[8];
const HERO_HEIGHT = SPACING[16] * 4;
const BADGE = SPACING[16];

function nameLine(profile: Profile): string {
  return profile.displayName
    ? profile.age !== null
      ? tr.profile.nameWithAge(profile.displayName, profile.age)
      : profile.displayName
    : tr.profile.noName;
}

// The own profile (canvas: Aşama 4 · Profil): the featured card with a colour block, the photo over
// its edge, the name with the age (never the birth date, rule 11), the bio and the actions.
export function OwnProfileCard({ profile, children }: { profile: Profile; children: ReactNode }) {
  const { colors, shape } = useTheme();
  return (
    <Card tone="feature" flush>
      <View style={{ height: BLOCK_HEIGHT, backgroundColor: colors.violet }} />
      <View className="gap-3 px-4 pb-4" style={{ marginTop: -SPACING[12] - SPACING[1] }}>
        <View
          className="self-start"
          style={{
            borderRadius: shape.radius.pill,
            borderWidth: SPACING[1],
            borderColor: colors.surface,
          }}
        >
          <ProfilePhoto url={profile.photoUrl} name={profile.displayName} />
        </View>
        <View className="gap-1">
          <Text variant="alias">{nameLine(profile)}</Text>
          {profile.bio ? <Text tone="muted">{profile.bio}</Text> : null}
        </View>
        {children}
      </View>
    </Card>
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

const BADGE_TONES = ['buzz', 'calm', 'lively'] as const;

// Badges as round tiles with the snail, or the snail and "Oynadıkça rozet kazanırsın".
export function Badges({ badges }: { badges: readonly BadgeId[] }) {
  const { colors } = useTheme();
  if (badges.length === 0) {
    return (
      <Card>
        <View className="flex-row items-center gap-3">
          <Snail height={SPACING[11]} />
          <Text className="flex-1">{tr.profile.noBadges}</Text>
        </View>
      </Card>
    );
  }
  const fill = {
    buzz: [colors.buzz, colors.onBuzz],
    calm: [colors.calm, colors.onCalm],
    lively: [colors.lively, colors.onLively],
  } as const;
  return (
    <View className="flex-row flex-wrap gap-y-4">
      {badges.map((badge, i) => {
        const [bg, fg] = fill[BADGE_TONES[i % BADGE_TONES.length] ?? 'buzz'];
        return (
          <View key={badge} className="items-center gap-2" style={{ width: '33.3%' }}>
            <View
              className="items-center justify-center"
              style={{ width: BADGE, height: BADGE, borderRadius: BADGE / 2, backgroundColor: bg }}
            >
              <SnailLineIcon size={SPACING[8]} color={fg} />
            </View>
            <Text variant="label" tone="text" align="center">
              {tr.profile.badges[badge]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
