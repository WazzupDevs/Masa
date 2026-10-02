import { Ionicons } from '@expo/vector-icons';
import { BADGES } from '@shared/badges.ts';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SnailLoader } from '@/components/Snail';
import { Text } from '@/components/Text';
import { useProfile } from '@/features/account/useProfile';
import { useFriends } from '@/features/friends/queries';
import { NotificationsBell } from '@/features/notifications/Bell';
import { Badges, OwnProfileHead } from '@/features/profile/ProfileCard';
import { useProfileView } from '@/features/profile/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON } from '@/theme/tokens';

// The own profile (docs/SPEC_V2.md §5; canvas: Aşama 5 · Geri bildirim → Profil). The photo, the
// name and the bio change on the edit screen; settings open only from the gear (top right).
export default function ProfileScreen() {
  const { colors } = useTheme();
  const own = useProfile();
  const publicId = own.data?.public_id;
  const view = useProfileView(publicId);
  const friends = useFriends();

  const hasName = !!own.data?.display_name;
  const friendCount = friends.data?.length;

  return (
    <Screen>
      <ScreenHeader
        title={tr.tabs.profile}
        trailing={<NotificationsBell />}
        action={{
          icon: 'settings-outline',
          label: tr.settings.title,
          onPress: () => router.push('/profile/settings'),
        }}
      />

      {view.isPending ? (
        <View className="mt-16">
          <SnailLoader />
        </View>
      ) : view.isError || !view.data ? (
        <EmptyState
          icon="cloud-offline-outline"
          body={errorMessage(view.error)}
          action={{ label: tr.common.retry, onPress: () => void view.refetch() }}
        />
      ) : (
        <View className="mt-2 gap-4">
          <OwnProfileHead profile={view.data}>
            <View className="mt-1 flex-row gap-2.5">
              <View className="flex-1">
                <Button
                  variant="secondary"
                  tight
                  icon="people-outline"
                  label={tr.profile.friends}
                  detail={friendCount !== undefined ? String(friendCount) : undefined}
                  accessibilityLabel={
                    friendCount !== undefined ? tr.profile.friendsCount(friendCount) : undefined
                  }
                  onPress={() => router.push('/profile/friends')}
                />
              </View>
              <View className="flex-1">
                <Button
                  tight
                  label={hasName ? tr.profile.editShort : tr.profile.addName}
                  accessibilityLabel={hasName ? tr.profile.edit : tr.profile.addName}
                  onPress={() => router.push('/profile/edit')}
                />
              </View>
            </View>
          </OwnProfileHead>
          {view.data.photoHidden ? (
            <Card tone="note">
              <View className="flex-row items-start gap-2">
                <Ionicons name="eye-off-outline" size={ICON.md} color={colors.text} />
                <Text variant="fine" tone="text" className="flex-1">
                  {tr.profile.photoHidden}
                </Text>
              </View>
            </Card>
          ) : null}
          <View className="mt-2 flex-row items-baseline justify-between">
            <Text variant="heading" accessibilityRole="header">
              {tr.profile.badgesTitle}
            </Text>
            <Text variant="fine">
              {tr.profile.badgeCount(view.data.badges.length, BADGES.length)}
            </Text>
          </View>
          <Badges badges={view.data.badges} all />
        </View>
      )}
    </Screen>
  );
}
