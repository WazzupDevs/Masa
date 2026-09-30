import {
  CURRENT_KVKK_VERSION,
  CURRENT_TERMS_VERSION,
  needsConsent,
  needsProfile,
} from '@shared/consent.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Checkbox } from '@/components/Checkbox';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
import { useProfile } from '@/features/account/useProfile';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { callAccount } from '@/lib/api';

// Terms and KVKK notice. A new account goes on to the profile step (about-you), where both are
// sent together with the name and birth date; an existing profile only re-consents here.
export default function ConsentsScreen() {
  const queryClient = useQueryClient();
  const profile = useProfile();
  const [terms, setTerms] = useState(false);
  const [kvkk, setKvkk] = useState(false);
  const hasProfile = !!profile.data && !needsProfile(profile.data);

  const reconsent = useMutation({
    mutationFn: () =>
      callAccount({
        action: 'complete-onboarding',
        termsVersion: CURRENT_TERMS_VERSION,
        kvkkVersion: CURRENT_KVKK_VERSION,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });

  // Consents are current and only the profile is missing (an account from before v3).
  if (profile.data && !needsConsent(profile.data)) return <Redirect href="/about-you" />;

  return (
    <Screen>
      <ScreenHeader
        title={tr.consents.title}
        subtitle={profile.data ? tr.consents.outdated : undefined}
      />
      <Card className="mt-6 gap-1">
        <Checkbox label={tr.consents.terms} checked={terms} onToggle={() => setTerms((v) => !v)} />
        <ReadLink href="/terms" />
        <Checkbox label={tr.consents.kvkk} checked={kvkk} onToggle={() => setKvkk((v) => !v)} />
        <ReadLink href="/kvkk" />
      </Card>
      {reconsent.isError ? (
        <Text variant="fine" tone="danger" className="mt-4">
          {errorMessage(reconsent.error)}
        </Text>
      ) : null}
      <View className="mt-auto pt-8">
        <Button
          label={tr.consents.accept}
          onPress={() => (hasProfile ? reconsent.mutate() : router.push('/about-you'))}
          disabled={!(terms && kvkk)}
          loading={reconsent.isPending}
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
