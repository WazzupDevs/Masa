import { CURRENT_KVKK_VERSION, CURRENT_TERMS_VERSION } from '@shared/consent.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
import { useProfile } from '@/features/account/useProfile';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { callAccount } from '@/lib/api';
import { track } from '@/lib/analytics';

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
    onSuccess: () => {
      if (!profile.data) track('onboarding_completed', {});
      return queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  return (
    <Screen>
      <ScreenHeader
        title={tr.consents.title}
        subtitle={profile.data ? tr.consents.outdated : undefined}
      />
      <View className="mt-6 gap-1">
        <Checkbox label={tr.consents.age} checked={age} onToggle={() => setAge((v) => !v)} />
        <Checkbox label={tr.consents.terms} checked={terms} onToggle={() => setTerms((v) => !v)} />
        <ReadLink href="/terms" />
        <Checkbox label={tr.consents.kvkk} checked={kvkk} onToggle={() => setKvkk((v) => !v)} />
        <ReadLink href="/kvkk" />
      </View>
      {accept.isError ? (
        <Text variant="fine" tone="danger" className="mt-4">
          {errorMessage(accept.error)}
        </Text>
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

// "Oku" under a consent, aligned with the checkbox label; 44 high for the finger.
function ReadLink({ href }: { href: '/terms' | '/kvkk' }) {
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link" className="ml-9 min-h-11 justify-center self-start">
        <Text tone="accent" variant="bodyStrong">
          {tr.consents.read}
        </Text>
      </Pressable>
    </Link>
  );
}
