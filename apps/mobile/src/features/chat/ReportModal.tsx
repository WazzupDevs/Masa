import { REPORT_REASONS, type ReportReason } from '@shared/chat.ts';
import { Modal, Text, View } from 'react-native';

import { Button } from '@/components/Button';
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
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/50 px-6">
        <View className="w-full gap-3 rounded-2xl bg-white p-6">
          <Text className="text-xl font-bold text-black">{tr.safety.reportTitle}</Text>
          {REPORT_REASONS.map((reason) => (
            <Button
              key={reason}
              variant="secondary"
              label={tr.safety.reasons[reason]}
              onPress={() => onReport(reason)}
              disabled={pending}
            />
          ))}
          {error ? <Text className="text-sm text-red-600">{errorMessage(error)}</Text> : null}
          <Button label={tr.common.cancel} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
