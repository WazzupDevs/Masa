import { useMutation } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, Linking, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { BlockedList } from '@/features/chat/BlockedList';
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
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      className="border-b border-neutral-200 py-3"
    >
      <Text className="text-base text-black">{label}</Text>
    </Pressable>
  );
}

async function signOutLocally() {
  // After deletion the server session no longer exists, so only local state is cleared.
  await supabase.auth.signOut({ scope: 'local' });
  queryClient.clear();
}

export default function SettingsScreen() {
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
      <Text className="text-3xl font-bold text-black">{tr.settings.title}</Text>
      <View className="mt-6">
        <BlockedList />
      </View>
      <View className="mt-6">
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
      <View className="mt-6 gap-1">
        <Text className="text-sm font-semibold text-neutral-500">{tr.settings.about}</Text>
        <Text className="text-sm text-neutral-500">
          {tr.settings.version(Constants.expoConfig?.version ?? '')}
        </Text>
        <Text className="text-sm text-neutral-500">{tr.settings.osm}</Text>
      </View>
      <View className="mt-auto gap-3 pt-8">
        {deleteAccount.isError ? (
          <Text className="text-sm text-red-600">{errorMessage(deleteAccount.error)}</Text>
        ) : null}
        <Button
          variant="secondary"
          label={tr.settings.signOut}
          onPress={() => signOut.mutate()}
          loading={signOut.isPending}
        />
        <Button
          variant="danger"
          label={tr.settings.deleteAccount}
          onPress={confirmDelete}
          loading={deleteAccount.isPending}
        />
      </View>
    </Screen>
  );
}
