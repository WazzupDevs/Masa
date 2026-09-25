import { PARTICIPATIONS, type Participation } from '@shared/profile.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Switch, View } from 'react-native';

import { Choice } from '@/components/Choice';
import { ListRow } from '@/components/ListRow';
import { Text } from '@/components/Text';
import { useProfile } from '@/features/account/useProfile';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { profileApi } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';

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
      <View accessibilityRole="radiogroup" className="gap-2">
        <Text variant="heading" accessibilityRole="header">
          {tr.settings.privacySection}
        </Text>
        <Text>{tr.settings.defaultParticipation}</Text>
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
        <Text variant="fine">{tr.settings.defaultParticipationHint}</Text>
      </View>

      <View>
        <Text variant="heading" accessibilityRole="header">
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
        <Text variant="fine" tone="danger">
          {errorMessage(update.error)}
        </Text>
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
  const { colors } = useTheme();
  return (
    <ListRow
      title={props.label}
      trailing={
        <Switch
          accessibilityLabel={props.label}
          value={props.value}
          disabled={props.disabled}
          onValueChange={props.onChange}
          trackColor={{ false: colors.surface2, true: colors.accent }}
          thumbColor={colors.surface}
          ios_backgroundColor={colors.surface2}
        />
      }
    />
  );
}
