import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { authErrorMessage } from '@/features/auth/authErrors';
import { tr } from '@/i18n/tr';
import { supabase } from '@/lib/supabase';

// Matches [auth.sms] max_frequency.
const RESEND_SECONDS = 60;
const CODE_LENGTH = 6;

export default function OtpScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  if (!phone) return <Redirect href="/phone" />;

  async function verify(token: string) {
    if (!phone || token.length !== CODE_LENGTH) return;
    setError(null);
    setVerifying(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    setVerifying(false);
    // On success the session store updates and the root navigator moves on.
    if (verifyError) setError(authErrorMessage(verifyError));
  }

  async function resend() {
    if (!phone) return;
    setError(null);
    setSecondsLeft(RESEND_SECONDS);
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone });
    if (otpError) setError(authErrorMessage(otpError));
  }

  function onChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) void verify(digits);
  }

  return (
    <Screen>
      <Text className="text-3xl font-bold text-black">{tr.auth.otpTitle}</Text>
      <Text className="mt-2 text-base text-neutral-600">{tr.auth.otpHint(phone)}</Text>
      <TextInput
        testID="otp-input"
        className="mt-8 h-14 rounded-xl border border-neutral-300 px-4 text-center text-2xl tracking-[8px] text-black"
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        autoFocus
        value={code}
        onChangeText={onChange}
        maxLength={CODE_LENGTH}
      />
      {error ? <Text className="mt-3 text-sm text-red-600">{error}</Text> : null}
      <View className="mt-auto gap-3 pt-8">
        <Button
          label={tr.auth.verify}
          onPress={() => void verify(code)}
          disabled={code.length !== CODE_LENGTH}
          loading={verifying}
        />
        <Button
          variant="secondary"
          label={secondsLeft > 0 ? tr.auth.resendIn(secondsLeft) : tr.auth.resend}
          onPress={() => void resend()}
          disabled={secondsLeft > 0}
        />
      </View>
    </Screen>
  );
}
