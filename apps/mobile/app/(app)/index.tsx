import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { callLeave } from '@/lib/api';

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function Header() {
  return (
    <View className="flex-row justify-end">
      <Link href="/settings" className="text-base text-blue-600">
        {tr.home.settings}
      </Link>
    </View>
  );
}

export default function HomeScreen() {
  const queryClient = useQueryClient();
  const table = useActiveTable();
  const now = useNow(30_000);

  const leave = useMutation({
    mutationFn: callLeave,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activeTable'] }),
  });

  const expiresAt = table.data ? Date.parse(table.data.expires_at) : null;
  const expired = expiresAt !== null && expiresAt <= now;

  useEffect(() => {
    if (expired) void queryClient.invalidateQueries({ queryKey: ['activeTable'] });
  }, [expired, queryClient]);

  if (table.isPending) {
    return (
      <Screen>
        <ActivityIndicator className="mt-16" />
      </Screen>
    );
  }

  if (!table.data || expired || expiresAt === null) {
    return (
      <Screen>
        <Header />
        <Text className="mt-4 text-3xl font-bold text-black">{tr.home.title}</Text>
        <Text className="mt-2 text-base text-neutral-600">{tr.home.hint}</Text>
        <View className="mt-auto pt-8">
          <Button label={tr.home.checkIn} onPress={() => router.push('/checkin')} />
        </View>
      </Screen>
    );
  }

  const minutesLeft = Math.max(0, Math.ceil((expiresAt - now) / 60_000));

  function confirmLeave() {
    Alert.alert(tr.venue.leaveConfirmTitle, tr.venue.leaveConfirmBody, [
      { text: tr.common.cancel, style: 'cancel' },
      { text: tr.venue.leaveConfirm, style: 'destructive', onPress: () => leave.mutate() },
    ]);
  }

  return (
    <Screen>
      <Header />
      <Text className="mt-4 text-3xl font-bold text-black">{table.data.venue?.name}</Text>
      <Text className="mt-6 text-sm text-neutral-500">{tr.venue.yourTable}</Text>
      <Text className="text-2xl font-semibold text-black">{table.data.alias}</Text>
      <Text className="mt-1 text-base text-neutral-600">
        {tr.venue.people(table.data.headcount)} ·{' '}
        {tr.venue.remaining(Math.floor(minutesLeft / 60), minutesLeft % 60)}
      </Text>
      <Text className="mt-8 text-base text-neutral-500">{tr.venue.roomsSoon}</Text>
      <View className="mt-auto gap-3 pt-8">
        {leave.isError ? (
          <Text className="text-sm text-red-600">{errorMessage(leave.error)}</Text>
        ) : null}
        <Button
          variant="secondary"
          label={tr.venue.leave}
          onPress={confirmLeave}
          loading={leave.isPending}
        />
      </View>
    </Screen>
  );
}
