import { PARTICIPATIONS, type Participation } from '@shared/profile.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Switch, Text, View } from 'react-native';

import { Choice } from '@/components/Choice';
import { useProfile } from '@/features/account/useProfile';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { profileApi } from '@/lib/api';

type Changes = {
  defaultParticipation?: Participation;
  notifyDm?: boolean;
  notifyFriendRequests?: boolean;
};

export function participationHint(mode: Participation, hasName: boolean): string {
  if (mode === 'anonymous') return tr.participation.anonymousHint;
  return hasName ? tr.participation.profileHint : tr.participation.profileNeedsName;
}

// Ayarlar → Gizlilik and Bildirimler (docs/SPEC_V2.md §5.5).
export function ProfileSettings() {
  const queryClient = useQueryClient();
  const own = useProfile();
  const update = useMutation({
    mutationFn: (changes: Changes) => profileApi.update(changes),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });
  if (!own.data) return null;
  const profile = own.data;
  const hasName = !!profile.display_name;

  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text className="text-sm font-semibold text-neutral-500">{tr.settings.privacySection}</Text>
        <Text className="text-base text-black">{tr.settings.defaultParticipation}</Text>
        {PARTICIPATIONS.map((mode) => (
          <Choice
            key={mode}
            label={tr.participation[mode]}
            hint={participationHint(mode, hasName)}
            selected={profile.default_participation === mode}
            disabled={update.isPending || (mode === 'profile' && !hasName)}
            onPress={() => update.mutate({ defaultParticipation: mode })}
          />
        ))}
        <Text className="text-sm text-neutral-500">{tr.settings.defaultParticipationHint}</Text>
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold text-neutral-500">
          {tr.settings.notificationsSection}
        </Text>
        <ToggleRow
          label={tr.settings.notifyDm}
          value={profile.notify_dm}
          disabled={update.isPending}
          onChange={(value) => update.mutate({ notifyDm: value })}
        />
        <ToggleRow
          label={tr.settings.notifyFriendRequests}
          value={profile.notify_friend_requests}
          disabled={update.isPending}
          onChange={(value) => update.mutate({ notifyFriendRequests: value })}
        />
      </View>

      {update.isError ? (
        <Text className="text-sm text-red-600">{errorMessage(update.error)}</Text>
      ) : null}
    </View>
  );
}

function ToggleRow(props: {
  label: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between border-b border-neutral-200 py-2">
      <Text className="text-base text-black">{props.label}</Text>
      <Switch
        accessibilityLabel={props.label}
        value={props.value}
        disabled={props.disabled}
        onValueChange={props.onChange}
      />
    </View>
  );
}
