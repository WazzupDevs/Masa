import { useMutation } from '@tanstack/react-query';
import { Alert, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { callAccount } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

async function signOutLocally() {
  // After deletion the server session no longer exists, so only local state is cleared.
  await supabase.auth.signOut({ scope: 'local' });
  queryClient.clear();
}

export default function SettingsScreen() {
  const signOut = useMutation({
    mutationFn: async () => {
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
