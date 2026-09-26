import { BIO_MAX, DISPLAY_NAME_MAX, DISPLAY_NAME_MIN } from '@shared/profile.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
import { useProfile } from '@/features/account/useProfile';
import { profileViewKeys } from '@/features/profile/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { profileApi } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';

// Display name and bio (docs/SPEC_V2.md §5.1). Length is checked here; the profile function
// checks length and profanity again.
export default function EditProfileScreen() {
  const { colors } = useTheme();
  const own = useProfile();
  if (own.isPending || !own.data) {
    return (
      <Screen>
        <ActivityIndicator className="mt-16" color={colors.muted} />
      </Screen>
    );
  }
  return <EditForm initialName={own.data.display_name ?? ''} initialBio={own.data.bio ?? ''} />;
}

function EditForm({ initialName, initialBio }: { initialName: string; initialBio: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);

  const nameLength = [...name.trim()].length;
  const nameValid = nameLength >= DISPLAY_NAME_MIN && nameLength <= DISPLAY_NAME_MAX;
  const nameChanged = name.trim() !== initialName;
  const bioChanged = bio.trim() !== initialBio;

  const save = useMutation({
    mutationFn: () =>
      profileApi.update({
        ...(nameChanged ? { displayName: name } : {}),
        ...(bioChanged ? { bio } : {}),
      }),
    onSuccess: async () => {
      if (bioChanged && bio.trim() !== '') track('profile_bio_set', {});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: profileViewKeys.all }),
      ]);
      router.back();
    },
  });

  return (
    <Screen>
      <ScreenHeader title={tr.profile.editTitle} onBack={() => router.back()} />

      <View className="mt-4 gap-6">
        <Input
          label={tr.profile.nameLabel}
          hint={tr.profile.nameHint}
          value={name}
          onChangeText={setName}
          maxLength={DISPLAY_NAME_MAX}
          autoCapitalize="words"
          autoCorrect={false}
        />
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

      {save.isError ? (
        <Text variant="fine" tone="danger" className="mt-4">
          {errorMessage(save.error)}
        </Text>
      ) : null}
      <View className="mt-auto gap-3 pt-8">
        <Button
          label={tr.profile.save}
          onPress={() => save.mutate()}
          disabled={!nameValid || (!nameChanged && !bioChanged)}
          loading={save.isPending}
        />
        <Button variant="ghost" label={tr.common.cancel} onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
