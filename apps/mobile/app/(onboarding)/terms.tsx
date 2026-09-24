import { LegalText } from '@/components/LegalText';
import { tr } from '@/i18n/tr';

export default function TermsScreen() {
  return <LegalText title={tr.legal.termsTitle} body={tr.legal.termsBody} />;
}
