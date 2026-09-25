import type { ProfileView } from '@shared/api/profile.ts';
import { View } from 'react-native';

import { ProfilePhoto } from '@/components/ProfilePhoto';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';

// Photo, name, bio and badges; the same card for the own profile and for others (§5.2).
export function ProfileCard({ profile }: { profile: ProfileView }) {
  return (
    <View>
      <View className="items-center gap-1.5">
        <ProfilePhoto url={profile.photoUrl} name={profile.displayName} />
        <Text variant="alias" align="center" className="mt-1">
          {profile.displayName ?? tr.profile.noName}
        </Text>
        {profile.bio ? <Text align="center">{profile.bio}</Text> : null}
      </View>
      <Text variant="heading" accessibilityRole="header" className="mb-2 mt-5">
        {tr.profile.badgesTitle}
      </Text>
      {profile.badges.length === 0 ? (
        <Text variant="fine">{tr.profile.noBadges}</Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {profile.badges.map((badge) => (
            <Tag key={badge} icon="ribbon-outline" label={tr.profile.badges[badge]} />
          ))}
        </View>
      )}
    </View>
  );
}
