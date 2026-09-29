import { Ionicons } from '@expo/vector-icons';
import type { Participation } from '@shared/profile.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { useProfile } from '@/features/account/useProfile';
import { choosePhoto, PhotoError, type PhotoSource } from '@/features/profile/photo';
import { ProfileCard } from '@/features/profile/ProfileCard';
import { participationHint } from '@/features/profile/ProfileSettings';
import { profileViewKeys, useProfileView } from '@/features/profile/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { profileApi } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON } from '@/theme/tokens';

function photoErrorMessage(err: unknown): string {
  if (err instanceof PhotoError) {
    return err.reason === 'permission' ? tr.profile.photoPermission : tr.profile.photoInvalid;
  }
  return errorMessage(err);
}

// The own profile (docs/SPEC_V2.md §5). Settings open only from the gear here (top right).
export default function ProfileScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const own = useProfile();
  const publicId = own.data?.public_id;
  const view = useProfileView(publicId);
  const [photoMenu, setPhotoMenu] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: profileViewKeys.all });
  const setPhoto = useMutation({
    mutationFn: (source: PhotoSource) => choosePhoto(source),
    onSuccess: (changed) => {
      if (changed) track('profile_photo_set', {});
      setPhotoMenu(false);
    },
    onSettled: refresh,
  });
  const removePhoto = useMutation({
    mutationFn: () => profileApi.photoRemove(),
    onSuccess: () => setPhotoMenu(false),
    onSettled: refresh,
  });

  const hasName = !!own.data?.display_name;
  const participation: Participation =
    own.data?.default_participation === 'profile' ? 'profile' : 'anonymous';
  const hasPhoto = !!view.data?.photoUrl || view.data?.photoHidden === true;

  return (
    <Screen>
      <ScreenHeader
        title={tr.tabs.profile}
        action={{
          icon: 'settings-outline',
          label: tr.settings.title,
          onPress: () => router.push('/profile/settings'),
        }}
      />

      {view.isPending ? (
        <ActivityIndicator className="mt-16" color={colors.muted} />
      ) : view.isError || !view.data ? (
        <EmptyState
          icon="cloud-offline-outline"
          body={errorMessage(view.error)}
          action={{ label: tr.common.retry, onPress: () => void view.refetch() }}
        />
      ) : (
        <View className="mt-2">
          <ProfileCard profile={view.data} />
          {view.data.photoHidden ? (
            <Card tone="note" className="mt-4">
              <View className="flex-row items-start gap-2">
                <Ionicons name="eye-off-outline" size={ICON.md} color={colors.text} />
                <Text variant="fine" tone="text" className="flex-1">
                  {tr.profile.photoHidden}
                </Text>
              </View>
            </Card>
          ) : null}
          {own.data ? (
            <Card className="mt-4">
              <View className="flex-row items-start gap-3">
                <Ionicons name="shield-checkmark-outline" size={ICON.md} color={colors.text} />
                <View className="flex-1 gap-0.5">
                  <Text variant="label">{tr.settings.defaultParticipation}</Text>
                  <Text variant="bodyStrong">{tr.participation[participation]}</Text>
                  <Text variant="fine">{participationHint(participation, hasName)}</Text>
                </View>
              </View>
            </Card>
          ) : null}
          <View className="mt-4 flex-row gap-2.5">
            <View className="flex-1">
              <Button
                label={hasName ? tr.profile.edit : tr.profile.addName}
                onPress={() => router.push('/profile/edit')}
              />
            </View>
            <View className="flex-1">
              <Button
                variant="secondary"
                label={tr.profile.photo}
                accessibilityLabel={hasPhoto ? tr.profile.photoChange : tr.profile.photoAdd}
                onPress={() => setPhotoMenu(true)}
                disabled={!hasName}
              />
            </View>
          </View>
          {!hasName ? (
            <Text variant="fine" className="mt-2">
              {tr.profile.photoNeedsName}
            </Text>
          ) : null}
        </View>
      )}

      <Sheet
        visible={photoMenu}
        onClose={() => setPhotoMenu(false)}
        title={tr.profile.photo}
        icon="image-outline"
      >
        <Text variant="fine">{tr.profile.photoPrivacy}</Text>
        <Button
          variant="secondary"
          label={tr.profile.photoFromLibrary}
          onPress={() => setPhoto.mutate('library')}
          loading={setPhoto.isPending && setPhoto.variables === 'library'}
          disabled={setPhoto.isPending || removePhoto.isPending}
        />
        <Button
          variant="secondary"
          label={tr.profile.photoFromCamera}
          onPress={() => setPhoto.mutate('camera')}
          loading={setPhoto.isPending && setPhoto.variables === 'camera'}
          disabled={setPhoto.isPending || removePhoto.isPending}
        />
        {hasPhoto ? (
          <Button
            variant="danger"
            label={tr.profile.photoRemove}
            onPress={() => removePhoto.mutate()}
            loading={removePhoto.isPending}
            disabled={setPhoto.isPending}
          />
        ) : null}
        {setPhoto.isError ? (
          <View className="gap-2">
            <Text variant="fine" tone="danger">
              {photoErrorMessage(setPhoto.error)}
            </Text>
            {setPhoto.error instanceof PhotoError && setPhoto.error.reason === 'permission' ? (
              <Button
                variant="secondary"
                label={tr.checkin.openSettings}
                onPress={() => void Linking.openSettings()}
              />
            ) : null}
          </View>
        ) : null}
        {removePhoto.isError ? (
          <Text variant="fine" tone="danger">
            {errorMessage(removePhoto.error)}
          </Text>
        ) : null}
        <Button variant="ghost" label={tr.common.cancel} onPress={() => setPhotoMenu(false)} />
      </Sheet>
    </Screen>
  );
}
