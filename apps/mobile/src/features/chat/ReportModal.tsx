import { REPORT_REASONS, type ReportReason } from '@shared/chat.ts';

import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';

type Props = {
  visible: boolean;
  pending: boolean;
  error: unknown;
  onReport: (reason: ReportReason) => void;
  onClose: () => void;
};

// Reason picker for "Şikayet et" (a room or a profile).
export function ReportModal({ visible, pending, error, onReport, onClose }: Props) {
  return (
    <Sheet visible={visible} onClose={onClose} title={tr.safety.reportTitle} icon="flag-outline">
      {REPORT_REASONS.map((reason) => (
        <Button
          key={reason}
          variant="secondary"
          label={tr.safety.reasons[reason]}
          onPress={() => onReport(reason)}
          disabled={pending}
        />
      ))}
      {error ? (
        <Text variant="fine" tone="danger">
          {errorMessage(error)}
        </Text>
      ) : null}
      <Button variant="ghost" label={tr.common.cancel} onPress={onClose} />
    </Sheet>
  );
}
