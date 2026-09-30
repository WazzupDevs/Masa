import { toTrMobileE164 } from '@shared/phone.ts';
import { AuthError } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
import { authErrorMessage } from '@/features/auth/authErrors';
import { useOnboardingStore } from '@/features/onboarding/store';
import { tr } from '@/i18n/tr';
import { supabase } from '@/lib/supabase';

export default function PhoneScreen() {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Set when sign-up ended under 18: the account was deleted, nothing was kept.
  const underAge = useOnboardingStore((s) => s.underAge);

  async function sendCode() {
    const phone = toTrMobileE164(input);
    if (!phone) {
      setError(tr.auth.errors.invalidPhone);
      return;
    }
    setError(null);
    useOnboardingStore.setState({ underAge: false });
    setSending(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone });
    setSending(false);
    if (otpError) {
      setError(otpError instanceof AuthError ? authErrorMessage(otpError) : tr.common.genericError);
      return;
    }
    router.push({ pathname: '/otp', params: { phone } });
  }

  return (
    <Screen>
      <ScreenHeader title={tr.auth.phoneTitle} subtitle={tr.auth.phoneHint} />
      {underAge ? (
        <Card tone="note" className="mt-4" testID="under-age">
          <Text variant="bodyStrong">{tr.underAge.title}</Text>
          <Text variant="fine">{tr.underAge.body}</Text>
        </Card>
      ) : null}
      <View className="mt-6">
        <Input
          testID="phone-input"
          prefix={tr.auth.phonePrefix}
          accessibilityLabel={tr.auth.phoneTitle}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder={tr.auth.phonePlaceholder}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={sendCode}
          maxLength={16}
          error={error}
        />
      </View>
      <View className="mt-auto pt-8">
        <Button label={tr.auth.sendCode} onPress={sendCode} loading={sending} />
      </View>
    </Screen>
  );
}
