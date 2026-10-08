import { BIO_MAX } from '@shared/profile.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { ProfilePhoto } from '@/components/ProfilePhoto';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
import { useProfile } from '@/features/account/useProfile';
import { useOnboardingStore } from '@/features/onboarding/store';
import { choosePhoto, PhotoError, type PhotoSource } from '@/features/profile/photo';
import { profileViewKeys, useProfileView } from '@/features/profile/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { profileApi } from '@/lib/api';

// The optional last sign-up step (docs/SPEC_V3.md §3.1): a photo and a bio, both skippable and
// both addable later from Profil. Finishing or skipping opens the app.
export default function ExtrasScreen() {
  const queryClient = useQueryClient();
  const [bio, setBio] = useState('');
  const [photoSet, setPhotoSet] = useState(false);
  // The preview: the uploaded photo, or the display name's initials.
  const own = useProfile();
  const view = useProfileView(own.data?.public_id);

  const photo = useMutation({
    mutationFn: (source: PhotoSource) => choosePhoto(source),
    onSuccess: async (changed) => {
      if (changed) {
        setPhotoSet(true);
        track('profile_photo_set', {});
        await queryClient.invalidateQueries({ queryKey: profileViewKeys.all });
      }
    },
  });

  const finish = useMutation({
    mutationFn: async (withBio: boolean) => {
      if (withBio) await profileApi.update({ bio });
      return withBio;
    },
    onSuccess: async (withBio) => {
      if (withBio) track('profile_bio_set', {});
      track('onboarding_completed', { with_photo: photoSet, with_bio: withBio });
      await queryClient.invalidateQueries({ queryKey: profileViewKeys.all });
      useOnboardingStore.setState({ extrasPending: false });
    },
  });

  const hasBio = bio.trim() !== '';

  return (
    <Screen>
      <ScreenHeader title={tr.signup.extrasTitle} subtitle={tr.signup.extrasBody} />
      <View className="mt-6 gap-6">
        <View className="gap-3">
          {/* The preview beside the two buttons keeps the whole step on one screen. */}
          <View className="flex-row items-center gap-4">
            <ProfilePhoto
              size="medium"
              url={view.data?.photoUrl ?? null}
              name={own.data?.display_name}
            />
            <View className="flex-1 gap-3">
              <Button
                variant="neutral"
                icon="image-outline"
                label={tr.profile.photoFromLibrary}
                onPress={() => photo.mutate('library')}
                disabled={photo.isPending}
              />
              <Button
                variant="neutral"
                icon="camera-outline"
                label={tr.profile.photoFromCamera}
                onPress={() => photo.mutate('camera')}
                disabled={photo.isPending}
              />
            </View>
          </View>
          <Text variant="fine">{tr.profile.photoPrivacy}</Text>
          {photo.isError ? (
            <Text variant="fine" tone="danger">
              {photo.error instanceof PhotoError
                ? photo.error.reason === 'permission'
                  ? tr.profile.photoPermission
                  : tr.profile.photoInvalid
                : errorMessage(photo.error)}
            </Text>
          ) : null}
        </View>
        <Input
          label={tr.profile.bioLabel}
          counter={tr.profile.bioHint([...bio].length, BIO_MAX)}
          value={bio}
          onChangeText={setBio}
          maxLength={BIO_MAX}
          multiline
        />
      </View>
      {finish.isError ? (
        <Text variant="fine" tone="danger" className="mt-4">
          {errorMessage(finish.error)}
        </Text>
      ) : null}
      <View className="mt-auto gap-3 pt-8">
        <Button
          testID="signup-finish"
          label={tr.signup.finish}
          onPress={() => finish.mutate(hasBio)}
          disabled={!photoSet && !hasBio}
          loading={finish.isPending}
        />
        <Button
          testID="signup-skip"
          variant="ghost"
          label={tr.signup.skip}
          onPress={() => finish.mutate(false)}
          disabled={finish.isPending}
        />
      </View>
    </Screen>
  );
}
