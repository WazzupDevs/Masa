import type { ReportReason } from '@shared/chat.ts';
import { useState } from 'react';

import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
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
      <Sheet
        visible={props.visible && !pickingReason}
        onClose={props.onClose}
        title={props.title}
        icon="shield-outline"
      >
        <Text variant="fine">{props.hint}</Text>
        <Checkbox
          label={tr.friends.alsoReport}
          checked={alsoReport}
          onToggle={() => setAlsoReport((v) => !v)}
        />
        {props.error ? (
          <Text variant="fine" tone="danger">
            {errorMessage(props.error)}
          </Text>
        ) : null}
        <Button
          variant="danger"
          label={props.confirmLabel}
          loading={props.pending}
          onPress={() => (alsoReport ? setPickingReason(true) : props.onConfirm(undefined))}
        />
        <Button variant="ghost" label={tr.common.cancel} onPress={props.onClose} />
      </Sheet>
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
