import { toTrMobileE164 } from '@shared/phone.ts';
import { AuthError } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { BrandLine, Snail } from '@/components/Snail';
import { Text } from '@/components/Text';
import { authErrorMessage } from '@/features/auth/authErrors';
import { useOnboardingStore } from '@/features/onboarding/store';
import { tr } from '@/i18n/tr';
import { supabase } from '@/lib/supabase';
import { SPACING } from '@/theme/tokens';

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

  // Sign-up ended under 18 (canvas: 18 yaş sınırı): the account was deleted, nothing was kept.
  if (underAge) {
    return (
      <Screen>
        <View testID="under-age" collapsable={false} className="flex-1 justify-center gap-4">
          <Snail height={SPACING[16] + SPACING[5]} />
          <Text variant="display" accessibilityRole="header">
            {tr.underAge.title}
          </Text>
          <Text tone="muted">{tr.underAge.body}</Text>
        </View>
        <View className="pt-8">
          <Button
            variant="neutral"
            label={tr.common.close}
            onPress={() => useOnboardingStore.setState({ underAge: false })}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="mb-3 mt-2">
        <BrandLine />
      </View>
      <ScreenHeader title={tr.auth.phoneTitle} subtitle={tr.auth.phoneHint} />
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
