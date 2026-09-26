import { toTrMobileE164 } from '@shared/phone.ts';
import { AuthError } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { authErrorMessage } from '@/features/auth/authErrors';
import { tr } from '@/i18n/tr';
import { supabase } from '@/lib/supabase';

export default function PhoneScreen() {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function sendCode() {
    const phone = toTrMobileE164(input);
    if (!phone) {
      setError(tr.auth.errors.invalidPhone);
      return;
    }
    setError(null);
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
      <Text className="text-3xl font-bold text-black">{tr.auth.phoneTitle}</Text>
      <Text className="mt-2 text-base text-neutral-600">{tr.auth.phoneHint}</Text>
      <View className="mt-8 h-14 flex-row items-center rounded-xl border border-neutral-300 px-4">
        <Text className="mr-2 text-lg text-neutral-500">{tr.auth.phonePrefix}</Text>
        <TextInput
          testID="phone-input"
          className="flex-1 text-lg text-black"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder={tr.auth.phonePlaceholder}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={sendCode}
          maxLength={16}
        />
      </View>
      {error ? <Text className="mt-3 text-sm text-red-600">{error}</Text> : null}
      <View className="mt-auto pt-8">
        <Button label={tr.auth.sendCode} onPress={sendCode} loading={sending} />
      </View>
    </Screen>
  );
}
