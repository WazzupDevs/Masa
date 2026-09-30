import { useMutation } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, Linking, View } from 'react-native';

import { Button } from '@/components/Button';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
import { BlockedList } from '@/features/chat/BlockedList';
import { DesignPicker } from '@/features/design/DesignPicker';
import { designPickerEnabled } from '@/theme/ThemeProvider';
import { ProfileSettings } from '@/features/profile/ProfileSettings';
import { useProfileView } from '@/features/profile/queries';
import { useProfile } from '@/features/account/useProfile';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { unregisterPush } from '@/features/push/push';
import { callAccount } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

// Hosted texts and contact come from the environment (store listings need both); without a
// privacy URL the in-app draft texts are shown.
const privacyUrl = process.env.EXPO_PUBLIC_PRIVACY_URL;
const contactEmail = process.env.EXPO_PUBLIC_CONTACT_EMAIL;

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return <ListRow title={label} onPress={onPress} accessibilityRole="link" />;
}

async function signOutLocally() {
  // After deletion the server session no longer exists, so only local state is cleared.
  await supabase.auth.signOut({ scope: 'local' });
  queryClient.clear();
}

export default function SettingsScreen() {
  // The own birth date comes only from profile/get (the column is closed to the client).
  const own = useProfile();
  const view = useProfileView(own.data?.public_id);
  const birthDate = view.data?.birthDate ?? null;
  const signOut = useMutation({
    mutationFn: async () => {
      await unregisterPush();
      await supabase.auth.signOut();
      queryClient.clear();
    },
  });
  const deleteAccount = useMutation({
    mutationFn: async () => {
      await callAccount({ action: 'delete' });
      await signOutLocally();
    },
  });

  function confirmDelete() {
    Alert.alert(tr.settings.deleteConfirmTitle, tr.settings.deleteConfirmBody, [
      { text: tr.common.cancel, style: 'cancel' },
      {
        text: tr.settings.deleteConfirm,
        style: 'destructive',
        onPress: () => deleteAccount.mutate(),
      },
    ]);
  }

  return (
    <Screen>
      <ScreenHeader title={tr.settings.title} onBack={() => router.back()} />
      {designPickerEnabled ? (
        <View className="mb-4 mt-4">
          <DesignPicker />
        </View>
      ) : null}
      {birthDate ? (
        <View className="mt-4">
          <Text variant="overline" tone="muted" accessibilityRole="header">
            {tr.settings.accountSection}
          </Text>
          <ListRow
            title={tr.settings.birthDate}
            meta={tr.settings.birthDateValue(birthDate)}
            below={<Text variant="fine">{tr.settings.birthDateHint}</Text>}
          />
        </View>
      ) : null}
      <View className="mt-4">
        <ProfileSettings />
      </View>
      <View className="mt-8">
        <BlockedList />
      </View>
      <View className="mt-8">
        <Text variant="overline" tone="muted" accessibilityRole="header">
          {tr.settings.legalSection}
        </Text>
        <Row
          label={tr.settings.privacy}
          onPress={() =>
            privacyUrl
              ? void Linking.openURL(privacyUrl)
              : router.push({ pathname: '/legal/[doc]', params: { doc: 'kvkk' } })
          }
        />
        <Row
          label={tr.settings.terms}
          onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}
        />
        {contactEmail ? (
          <Row
            label={tr.settings.contact}
            onPress={() => void Linking.openURL(`mailto:${contactEmail}`)}
          />
        ) : null}
      </View>
      <View className="mt-auto gap-3 pt-8">
        {deleteAccount.isError ? (
          <Text variant="fine" tone="danger">
            {errorMessage(deleteAccount.error)}
          </Text>
        ) : null}
        <View className="flex-row gap-2.5">
          <View className="flex-1">
            <Button
              variant="secondary"
              label={tr.settings.signOut}
              onPress={() => signOut.mutate()}
              loading={signOut.isPending}
            />
          </View>
          <View className="flex-1">
            <Button
              variant="dangerText"
              label={tr.settings.deleteAccount}
              onPress={confirmDelete}
              loading={deleteAccount.isPending}
            />
          </View>
        </View>
        <Text variant="fine" align="center">
          {tr.settings.version(Constants.expoConfig?.version ?? '')}
        </Text>
        <Text variant="fine" align="center">
          {tr.settings.osm}
        </Text>
      </View>
    </Screen>
  );
}
