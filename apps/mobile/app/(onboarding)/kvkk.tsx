import { LegalText } from '@/components/LegalText';
import { tr } from '@/i18n/tr';

export default function KvkkScreen() {
  return <LegalText title={tr.legal.kvkkTitle} body={tr.legal.kvkkBody} />;
}
