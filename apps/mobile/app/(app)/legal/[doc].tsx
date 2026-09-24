import { Redirect, useLocalSearchParams } from 'expo-router';

import { LegalText } from '@/components/LegalText';
import { tr } from '@/i18n/tr';

// The in-app texts (draft-0) when no hosted privacy URL is configured.
export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  if (doc === 'terms') return <LegalText title={tr.legal.termsTitle} body={tr.legal.termsBody} />;
  if (doc === 'kvkk') return <LegalText title={tr.legal.kvkkTitle} body={tr.legal.kvkkBody} />;
  return <Redirect href="/settings" />;
}
