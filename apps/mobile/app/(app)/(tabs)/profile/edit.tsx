import { BIO_MAX, DISPLAY_NAME_MAX, DISPLAY_NAME_MIN } from '@shared/profile.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useProfile } from '@/features/account/useProfile';
import { profileViewKeys } from '@/features/profile/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { profileApi } from '@/lib/api';

// Display name and bio (docs/SPEC_V2.md §5.1). Length is checked here; the profile function
// checks length and profanity again.
export default function EditProfileScreen() {
  const own = useProfile();
  if (own.isPending || !own.data) {
    return (
      <Screen>
        <ActivityIndicator className="mt-16" />
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
      <Text className="text-3xl font-bold text-black">{tr.profile.editTitle}</Text>

      <Text className="mt-8 text-sm font-semibold text-neutral-500">{tr.profile.nameLabel}</Text>
      <TextInput
        className="mt-2 rounded-xl border border-neutral-300 px-4 py-3 text-lg text-black"
        value={name}
        onChangeText={setName}
        maxLength={DISPLAY_NAME_MAX}
        autoCapitalize="words"
        autoCorrect={false}
      />
      <Text className="mt-2 text-sm text-neutral-500">{tr.profile.nameHint}</Text>

      <Text className="mt-6 text-sm font-semibold text-neutral-500">{tr.profile.bioLabel}</Text>
      <TextInput
        className="mt-2 min-h-24 rounded-xl border border-neutral-300 px-4 py-3 text-base text-black"
        value={bio}
        onChangeText={setBio}
        maxLength={BIO_MAX}
        multiline
        textAlignVertical="top"
      />
      <Text className="mt-2 text-right text-sm text-neutral-500">
        {tr.profile.bioHint([...bio].length, BIO_MAX)}
      </Text>

      {save.isError ? (
        <Text className="mt-4 text-sm text-red-600">{errorMessage(save.error)}</Text>
      ) : null}
      <View className="mt-auto gap-3 pt-8">
        <Button
          label={tr.profile.save}
          onPress={() => save.mutate()}
          disabled={!nameValid || (!nameChanged && !bioChanged)}
          loading={save.isPending}
        />
        <Button variant="secondary" label={tr.common.cancel} onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
