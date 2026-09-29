import type { ReportReason } from '@shared/chat.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { roomKeys } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { safetyApi } from '@/lib/api';

import { ReportModal } from './ReportModal';

type Props = { roomId: string; hasOtherTable: boolean };

// "Şikayet et" and "Engelle" in the room menu (MVP_SPEC §4.5, §8).
export function RoomSafety({ roomId, hasOtherTable }: Props) {
  const queryClient = useQueryClient();
  const [reporting, setReporting] = useState(false);

  const report = useMutation({
    mutationFn: (reason: ReportReason) => safetyApi.report(roomId, reason),
    onSuccess: () => {
      track('report_submitted', {});
      setReporting(false);
      Alert.alert(tr.safety.reportSent);
    },
  });
  const block = useMutation({
    mutationFn: () => safetyApi.block(roomId),
    onSuccess: () => track('block_created', {}),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: roomKeys.current });
      void queryClient.invalidateQueries({ queryKey: roomKeys.room(roomId) });
    },
  });

  function confirmBlock() {
    Alert.alert(tr.safety.blockConfirmTitle, tr.safety.blockConfirmBody, [
      { text: tr.common.cancel, style: 'cancel' },
      { text: tr.safety.blockConfirm, style: 'destructive', onPress: () => block.mutate() },
    ]);
  }

  return (
    <View className="gap-3">
      {block.isError ? (
        <Text variant="fine" tone="danger">
          {errorMessage(block.error)}
        </Text>
      ) : null}
      <Button variant="secondary" label={tr.safety.report} onPress={() => setReporting(true)} />
      {hasOtherTable ? (
        <Button
          variant="secondary"
          label={tr.safety.block}
          onPress={confirmBlock}
          loading={block.isPending}
        />
      ) : null}

      <ReportModal
        visible={reporting}
        pending={report.isPending}
        error={report.error}
        onReport={(reason) => report.mutate(reason)}
        onClose={() => setReporting(false)}
      />
    </View>
  );
}
