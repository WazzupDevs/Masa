import type { ReportReason } from '@shared/chat.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-native';

import { roomKeys } from '@/features/rooms/queries';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { safetyApi } from '@/lib/api';

import { ReportModal } from './ReportModal';

// "Şikayet et" and "Engelle" for the room's ⋯ menu (MVP_SPEC §4.5, §8). The actions are started
// from the menu; the report form lives outside it, so it stays open after the menu closes.
export function useRoomSafety(roomId: string) {
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

  const reportForm = (
    <ReportModal
      visible={reporting}
      pending={report.isPending}
      error={report.error}
      onReport={(reason) => report.mutate(reason)}
      onClose={() => setReporting(false)}
    />
  );
  return {
    startReport: () => setReporting(true),
    confirmBlock,
    blocking: block.isPending,
    blockError: block.error,
    reportForm,
  };
}
