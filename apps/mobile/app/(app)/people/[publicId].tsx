import type { ReportReason } from '@shared/chat.ts';
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { ReportModal } from '@/features/chat/ReportModal';
import { ProfileCard } from '@/features/profile/ProfileCard';
import { useProfileView } from '@/features/profile/queries';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { safetyApi } from '@/lib/api';

// Another account's profile: only while the viewer may see it (a friend, or the other table of
// the current room). Anything else, including a room that just ended, reads as "not visible".
export default function PersonScreen() {
  const { publicId } = useLocalSearchParams<{ publicId: string }>();
  const view = useProfileView(publicId);
  const [reporting, setReporting] = useState(false);

  const report = useMutation({
    mutationFn: (reason: ReportReason) => safetyApi.reportProfile(publicId, reason),
    onSuccess: () => {
      track('report_submitted', {});
      setReporting(false);
      Alert.alert(tr.safety.reportSent);
    },
  });

  return (
    <Screen>
      {view.isPending ? (
        <ActivityIndicator className="mt-16" />
      ) : !view.data ? (
        <Text className="mt-8 text-base text-neutral-600">{tr.profile.notVisible}</Text>
      ) : (
        <View className="mt-4">
          <ProfileCard profile={view.data} />
          <View className="mt-8">
            <Button
              variant="secondary"
              label={tr.profile.report}
              onPress={() => setReporting(true)}
            />
          </View>
        </View>
      )}
      <View className="mt-auto pt-8">
        <Button label={tr.profile.back} onPress={() => router.back()} />
      </View>
      <ReportModal
        visible={reporting}
        pending={report.isPending}
        error={report.error}
        onReport={(reason) => report.mutate(reason)}
        onClose={() => setReporting(false)}
      />
    </Screen>
  );
}
