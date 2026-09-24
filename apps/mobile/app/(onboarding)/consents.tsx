import { CURRENT_KVKK_VERSION, CURRENT_TERMS_VERSION } from '@shared/consent.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { Screen } from '@/components/Screen';
import { useProfile } from '@/features/account/useProfile';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { callAccount } from '@/lib/api';

export default function ConsentsScreen() {
  const queryClient = useQueryClient();
  const profile = useProfile();
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [kvkk, setKvkk] = useState(false);

  const accept = useMutation({
    mutationFn: () =>
      callAccount({
        action: 'complete-onboarding',
        ageConfirmed: true,
        termsVersion: CURRENT_TERMS_VERSION,
        kvkkVersion: CURRENT_KVKK_VERSION,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });

  return (
    <Screen>
      <Text className="text-3xl font-bold text-black">{tr.consents.title}</Text>
      {profile.data ? (
        <Text className="mt-2 text-base text-neutral-600">{tr.consents.outdated}</Text>
      ) : null}
      <View className="mt-8 gap-2">
        <Checkbox label={tr.consents.age} checked={age} onToggle={() => setAge((v) => !v)} />
        <Checkbox label={tr.consents.terms} checked={terms} onToggle={() => setTerms((v) => !v)} />
        <Link href="/terms" className="ml-9 text-base text-blue-600 underline">
          {tr.consents.read}
        </Link>
        <Checkbox label={tr.consents.kvkk} checked={kvkk} onToggle={() => setKvkk((v) => !v)} />
        <Link href="/kvkk" className="ml-9 text-base text-blue-600 underline">
          {tr.consents.read}
        </Link>
      </View>
      {accept.isError ? (
        <Text className="mt-4 text-sm text-red-600">{errorMessage(accept.error)}</Text>
      ) : null}
      <View className="mt-auto pt-8">
        <Button
          label={tr.consents.accept}
          onPress={() => accept.mutate()}
          disabled={!(age && terms && kvkk)}
          loading={accept.isPending}
        />
      </View>
    </Screen>
  );
}
