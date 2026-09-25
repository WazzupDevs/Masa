import type { ReportReason } from '@shared/chat.ts';
import { useState } from 'react';
import { Modal, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { ReportModal } from '@/features/chat/ReportModal';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';

type Props = {
  visible: boolean;
  title: string;
  hint: string;
  confirmLabel: string;
  pending: boolean;
  error: unknown;
  onConfirm: (report: ReportReason | undefined) => void;
  onClose: () => void;
};

// Block or unfriend with the "Şikayet de et" option (docs/SPEC_V2.md §6.4): the server copies the
// report in the same transaction before anything is deleted.
export function ConfirmWithReport(props: Props) {
  const [alsoReport, setAlsoReport] = useState(false);
  const [pickingReason, setPickingReason] = useState(false);

  return (
    <>
      <Modal
        transparent
        animationType="fade"
        visible={props.visible && !pickingReason}
        onRequestClose={props.onClose}
      >
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <View className="w-full gap-3 rounded-2xl bg-white p-6">
            <Text className="text-xl font-bold text-black">{props.title}</Text>
            <Text className="text-sm text-neutral-600">{props.hint}</Text>
            <Checkbox
              label={tr.friends.alsoReport}
              checked={alsoReport}
              onToggle={() => setAlsoReport((v) => !v)}
            />
            {props.error ? (
              <Text className="text-sm text-red-600">{errorMessage(props.error)}</Text>
            ) : null}
            <Button
              variant="danger"
              label={props.confirmLabel}
              loading={props.pending}
              onPress={() => (alsoReport ? setPickingReason(true) : props.onConfirm(undefined))}
            />
            <Button variant="secondary" label={tr.common.cancel} onPress={props.onClose} />
          </View>
        </View>
      </Modal>
      <ReportModal
        visible={props.visible && pickingReason}
        pending={props.pending}
        error={props.error}
        onReport={(reason) => {
          setPickingReason(false);
          props.onConfirm(reason);
        }}
        onClose={() => setPickingReason(false)}
      />
    </>
  );
}
