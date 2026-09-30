import { composeBirthDate } from '@shared/age.ts';
import { CURRENT_KVKK_VERSION, CURRENT_TERMS_VERSION } from '@shared/consent.ts';
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN } from '@shared/profile.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
import { useProfile } from '@/features/account/useProfile';
import { useOnboardingStore } from '@/features/onboarding/store';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { ApiError, callAccount } from '@/lib/api';
import { queryClient as rootQueryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

// Sign-up = profile (docs/SPEC_V3.md §3): display name and birth date, sent with the consents in
// one call. Under 18 the server deletes the account; the phone signs out and the phone screen says
// why. The birth date is never shown to anyone; the profile shows the age.
export default function AboutYouScreen() {
  const queryClient = useQueryClient();
  const profile = useProfile();
  const needsBirthDate = profile.data?.has_birth_date !== true;
  const [name, setName] = useState(profile.data?.display_name ?? '');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);

  const nameLength = [...name.trim()].length;
  const nameValid = nameLength >= DISPLAY_NAME_MIN && nameLength <= DISPLAY_NAME_MAX;
  const dateFilled = !needsBirthDate || (day !== '' && month !== '' && year.length === 4);

  const submit = useMutation({
    mutationFn: (birthDate: string | undefined) =>
      callAccount({
        action: 'complete-onboarding',
        termsVersion: CURRENT_TERMS_VERSION,
        kvkkVersion: CURRENT_KVKK_VERSION,
        displayName: name,
        ...(birthDate ? { birthDate } : {}),
      }),
    onSuccess: async () => {
      // Keep the onboarding screens for the optional photo step before the gate opens.
      useOnboardingStore.setState({ extrasPending: true });
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      router.replace('/extras');
    },
    onError: async (err) => {
      if (err instanceof ApiError && err.code === 'under_age') {
        // The account no longer exists: clear the session on the phone only.
        useOnboardingStore.setState({ underAge: true });
        await supabase.auth.signOut({ scope: 'local' });
        rootQueryClient.clear();
      }
    },
  });

  function onContinue() {
    let birthDate: string | undefined;
    if (needsBirthDate) {
      const composed = composeBirthDate(day, month, year);
      if (!composed) {
        setDateError(tr.signup.birthInvalid);
        return;
      }
      birthDate = composed;
    }
    setDateError(null);
    submit.mutate(birthDate);
  }

  return (
    <Screen>
      <ScreenHeader title={tr.signup.title} subtitle={tr.signup.adultsOnly} />
      <View className="mt-6 gap-6">
        <Input
          testID="signup-name"
          label={tr.signup.nameLabel}
          hint={tr.signup.nameHint}
          value={name}
          onChangeText={setName}
          maxLength={DISPLAY_NAME_MAX}
          autoCapitalize="words"
          autoCorrect={false}
        />
        {needsBirthDate ? (
          <View className="gap-2">
            <Text variant="label">{tr.signup.birthLabel}</Text>
            <View className="flex-row gap-2.5">
              <View className="flex-1 gap-1">
                <Input
                  testID="birth-day"
                  accessibilityLabel={tr.signup.day}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={day}
                  onChangeText={setDay}
                  centered
                />
                <Text variant="fine" align="center">
                  {tr.signup.day}
                </Text>
              </View>
              <View className="flex-1 gap-1">
                <Input
                  testID="birth-month"
                  accessibilityLabel={tr.signup.month}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={month}
                  onChangeText={setMonth}
                  centered
                />
                <Text variant="fine" align="center">
                  {tr.signup.month}
                </Text>
              </View>
              <View className="flex-[1.6] gap-1">
                <Input
                  testID="birth-year"
                  accessibilityLabel={tr.signup.year}
                  keyboardType="number-pad"
                  maxLength={4}
                  value={year}
                  onChangeText={setYear}
                  centered
                />
                <Text variant="fine" align="center">
                  {tr.signup.year}
                </Text>
              </View>
            </View>
            <Text variant="fine" tone={dateError ? 'danger' : undefined}>
              {dateError ?? tr.signup.birthHint}
            </Text>
          </View>
        ) : null}
      </View>
      {submit.isError &&
      !(submit.error instanceof ApiError && submit.error.code === 'under_age') ? (
        <Text variant="fine" tone="danger" className="mt-4">
          {errorMessage(submit.error)}
        </Text>
      ) : null}
      <View className="mt-auto pt-8">
        <Button
          testID="signup-continue"
          label={tr.signup.continue}
          onPress={onContinue}
          disabled={!nameValid || !dateFilled}
          loading={submit.isPending}
        />
      </View>
    </Screen>
  );
}
