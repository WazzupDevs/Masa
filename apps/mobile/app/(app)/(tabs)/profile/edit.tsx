import { Ionicons } from '@expo/vector-icons';
import { BIO_MAX, DISPLAY_NAME_MAX, DISPLAY_NAME_MIN } from '@shared/profile.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { ProfilePhoto } from '@/components/ProfilePhoto';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { useProfile } from '@/features/account/useProfile';
import { choosePhoto, PhotoError, type PhotoSource } from '@/features/profile/photo';
import { profileViewKeys, useProfileView } from '@/features/profile/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { profileApi } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING } from '@/theme/tokens';

function photoErrorMessage(err: unknown): string {
  if (err instanceof PhotoError) {
    return err.reason === 'permission' ? tr.profile.photoPermission : tr.profile.photoInvalid;
  }
  return errorMessage(err);
}

// The photo, the display name and the bio (docs/SPEC_V2.md §5.1; canvas: Aşama 5 · Geri bildirim →
// Profili düzenle). Length is checked here; the profile function checks length and profanity
// again. The birth date cannot change (rule 11).
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
  return (
    <EditForm
      publicId={own.data.public_id}
      initialName={own.data.display_name ?? ''}
      initialBio={own.data.bio ?? ''}
    />
  );
}

// A photo needs a saved name first (the server refuses it otherwise).
function PhotoEditor({ publicId, hasName }: { publicId: string; hasName: boolean }) {
  const { colors, shape } = useTheme();
  const queryClient = useQueryClient();
  const view = useProfileView(publicId);
  const [menu, setMenu] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: profileViewKeys.all });
  const setPhoto = useMutation({
    mutationFn: (source: PhotoSource) => choosePhoto(source),
    onSuccess: (changed) => {
      if (changed) track('profile_photo_set', {});
      setMenu(false);
    },
    onSettled: refresh,
  });
  const removePhoto = useMutation({
    mutationFn: () => profileApi.photoRemove(),
    onSuccess: () => setMenu(false),
    onSettled: refresh,
  });
  const hasPhoto = !!view.data?.photoUrl || view.data?.photoHidden === true;
  const label = hasPhoto ? tr.profile.photoChange : tr.profile.photoAdd;

  return (
    <View className="items-center gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !hasName }}
        disabled={!hasName}
        onPress={() => setMenu(true)}
        className="items-center gap-2"
        style={{ opacity: hasName ? 1 : 0.6 }}
      >
        <View>
          <ProfilePhoto url={view.data?.photoUrl ?? null} name={view.data?.displayName} />
          <View
            className="absolute items-center justify-center"
            style={{
              right: -SPACING[1],
              bottom: -SPACING[1],
              width: SPACING[10],
              height: SPACING[10],
              borderRadius: shape.radius.pill,
              backgroundColor: colors.accent,
              borderWidth: SPACING[1],
              borderColor: colors.canvas,
            }}
          >
            <Ionicons name="camera-outline" size={ICON.md} color={colors.onAccent} />
          </View>
        </View>
        <View style={{ minHeight: SPACING[11], justifyContent: 'center' }}>
          <Text variant="label" tone="accent">
            {label}
          </Text>
        </View>
      </Pressable>
      {!hasName ? (
        <Text variant="fine" align="center">
          {tr.profile.photoNeedsName}
        </Text>
      ) : null}

      <Sheet
        visible={menu}
        onClose={() => setMenu(false)}
        title={tr.profile.photo}
        icon="image-outline"
      >
        <Text variant="fine">{tr.profile.photoPrivacy}</Text>
        <Button
          variant="neutral"
          label={tr.profile.photoFromLibrary}
          onPress={() => setPhoto.mutate('library')}
          loading={setPhoto.isPending && setPhoto.variables === 'library'}
          disabled={setPhoto.isPending || removePhoto.isPending}
        />
        <Button
          variant="neutral"
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
                variant="neutral"
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
        <Button variant="ghost" label={tr.common.cancel} onPress={() => setMenu(false)} />
      </Sheet>
    </View>
  );
}

function EditForm({
  publicId,
  initialName,
  initialBio,
}: {
  publicId: string;
  initialName: string;
  initialBio: string;
}) {
  const { colors } = useTheme();
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
        <PhotoEditor publicId={publicId} hasName={initialName !== ''} />
        <Input
          testID="name-input"
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
        <Card tone="note">
          <View className="flex-row items-start gap-2">
            <Ionicons name="calendar-outline" size={ICON.md} color={colors.text} />
            <Text variant="fine" tone="text" className="flex-1">
              {tr.profile.birthDateNote}
            </Text>
          </View>
        </Card>
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
