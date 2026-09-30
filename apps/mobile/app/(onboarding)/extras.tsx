import { BIO_MAX } from '@shared/profile.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
import { useOnboardingStore } from '@/features/onboarding/store';
import { choosePhoto, PhotoError } from '@/features/profile/photo';
import { profileViewKeys } from '@/features/profile/queries';
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

  const photo = useMutation({
    mutationFn: () => choosePhoto('library'),
    onSuccess: (changed) => {
      if (changed) {
        setPhotoSet(true);
        track('profile_photo_set', {});
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
        <View className="gap-2">
          <Button
            variant="secondary"
            icon="image-outline"
            label={photoSet ? tr.profile.photoChange : tr.profile.photoAdd}
            onPress={() => photo.mutate()}
            loading={photo.isPending}
          />
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
          tall
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
