import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useProfile } from '@/features/account/useProfile';
import { choosePhoto, PhotoError, type PhotoSource } from '@/features/profile/photo';
import { ProfileCard } from '@/features/profile/ProfileCard';
import { profileViewKeys, useProfileView } from '@/features/profile/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { profileApi } from '@/lib/api';

function photoErrorMessage(err: unknown): string {
  if (err instanceof PhotoError) {
    return err.reason === 'permission' ? tr.profile.photoPermission : tr.profile.photoInvalid;
  }
  return errorMessage(err);
}

// The own profile (docs/SPEC_V2.md §5). Settings open only from the gear here (top right).
export default function ProfileScreen() {
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
  const hasPhoto = !!view.data?.photoUrl || view.data?.photoHidden === true;

  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <Text className="text-3xl font-bold text-black">{tr.tabs.profile}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr.settings.title}
          hitSlop={12}
          onPress={() => router.push('/profile/settings')}
        >
          <Ionicons name="settings-outline" size={26} color="black" />
        </Pressable>
      </View>

      {view.isPending ? (
        <ActivityIndicator className="mt-16" />
      ) : view.isError || !view.data ? (
        <View className="mt-8 gap-3">
          <Text className="text-base text-neutral-600">{errorMessage(view.error)}</Text>
          <Button variant="secondary" label={tr.common.retry} onPress={() => void view.refetch()} />
        </View>
      ) : (
        <View className="mt-8">
          <ProfileCard profile={view.data} />
          {view.data.photoHidden ? (
            <Text className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
              {tr.profile.photoHidden}
            </Text>
          ) : null}
          <View className="mt-8 gap-3">
            <Button
              label={hasName ? tr.profile.edit : tr.profile.addName}
              onPress={() => router.push('/profile/edit')}
            />
            <Button
              variant="secondary"
              label={hasPhoto ? tr.profile.photoChange : tr.profile.photoAdd}
              onPress={() => setPhotoMenu(true)}
              disabled={!hasName}
            />
            {!hasName ? (
              <Text className="text-sm text-neutral-500">{tr.profile.photoNeedsName}</Text>
            ) : null}
          </View>
        </View>
      )}

      <Modal
        transparent
        animationType="fade"
        visible={photoMenu}
        onRequestClose={() => setPhotoMenu(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <View className="w-full gap-3 rounded-2xl bg-white p-6">
            <Text className="text-xl font-bold text-black">{tr.profile.photo}</Text>
            <Text className="text-sm text-neutral-500">{tr.profile.photoPrivacy}</Text>
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
                <Text className="text-sm text-red-600">{photoErrorMessage(setPhoto.error)}</Text>
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
              <Text className="text-sm text-red-600">{errorMessage(removePhoto.error)}</Text>
            ) : null}
            <Button label={tr.common.cancel} onPress={() => setPhotoMenu(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
