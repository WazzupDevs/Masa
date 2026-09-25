import type { ProfileView } from '@shared/api/profile.ts';
import { Image, Text, View } from 'react-native';

import { tr } from '@/i18n/tr';

// Photo, name, bio and badges; the same card for the own profile and for others (§5.2).
export function ProfileCard({ profile }: { profile: ProfileView }) {
  return (
    <View className="items-center">
      <ProfilePhoto url={profile.photoUrl} />
      <Text className="mt-4 text-2xl font-bold text-black">
        {profile.displayName ?? tr.profile.noName}
      </Text>
      {profile.bio ? (
        <Text className="mt-2 text-center text-base text-neutral-700">{profile.bio}</Text>
      ) : null}
      <View className="mt-6 w-full">
        <Text className="text-sm font-semibold text-neutral-500">{tr.profile.badgesTitle}</Text>
        {profile.badges.length === 0 ? (
          <Text className="mt-2 text-sm text-neutral-500">{tr.profile.noBadges}</Text>
        ) : (
          <View className="mt-2 flex-row flex-wrap gap-2">
            {profile.badges.map((badge) => (
              <Text
                key={badge}
                className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-black"
              >
                {tr.profile.badges[badge]}
              </Text>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export function ProfilePhoto({ url }: { url: string | null }) {
  return url ? (
    <Image
      source={{ uri: url }}
      accessibilityIgnoresInvertColors
      className="h-28 w-28 rounded-full bg-neutral-100"
    />
  ) : (
    <View className="h-28 w-28 rounded-full bg-neutral-200" />
  );
}
