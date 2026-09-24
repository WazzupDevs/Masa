import { REPORT_REASONS, type ReportReason } from '@shared/chat.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Modal, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { roomKeys } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { safetyApi } from '@/lib/api';

type Props = { roomId: string; hasOtherTable: boolean };

// "Şikayet et" and "Engelle" in the room menu (MVP_SPEC §4.5, §8).
export function RoomSafety({ roomId, hasOtherTable }: Props) {
  const queryClient = useQueryClient();
  const [reporting, setReporting] = useState(false);

  const report = useMutation({
    mutationFn: (reason: ReportReason) => safetyApi.report(roomId, reason),
    onSuccess: () => {
      setReporting(false);
      Alert.alert(tr.safety.reportSent);
    },
  });
  const block = useMutation({
    mutationFn: () => safetyApi.block(roomId),
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
        <Text className="text-sm text-red-600">{errorMessage(block.error)}</Text>
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

      <Modal
        transparent
        animationType="fade"
        visible={reporting}
        onRequestClose={() => setReporting(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <View className="w-full gap-3 rounded-2xl bg-white p-6">
            <Text className="text-xl font-bold text-black">{tr.safety.reportTitle}</Text>
            {REPORT_REASONS.map((reason) => (
              <Button
                key={reason}
                variant="secondary"
                label={tr.safety.reasons[reason]}
                onPress={() => report.mutate(reason)}
                disabled={report.isPending}
              />
            ))}
            {report.isError ? (
              <Text className="text-sm text-red-600">{errorMessage(report.error)}</Text>
            ) : null}
            <Button label={tr.common.cancel} onPress={() => setReporting(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
