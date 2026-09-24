import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { tr } from '@/i18n/tr';
import { safetyApi } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const blocksKey = ['blocks'] as const;

// "Engellenenler" in settings (screen 9): the alias seen when blocking, with unblock. Rows are
// read and unblocked by their own id; the blocked account's id never reaches the app (rule 4).
export function BlockedList() {
  const queryClient = useQueryClient();
  const blocks = useQuery({
    queryKey: blocksKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blocks')
        .select('id, blocked_alias, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const unblock = useMutation({
    mutationFn: safetyApi.unblock,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: blocksKey }),
  });

  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-neutral-500">{tr.safety.blockedTitle}</Text>
      {blocks.data?.length === 0 ? (
        <Text className="text-base text-neutral-500">{tr.safety.blockedEmpty}</Text>
      ) : null}
      {blocks.data?.map((b) => (
        <View
          key={b.id}
          className="flex-row items-center justify-between rounded-xl border border-neutral-200 p-3"
        >
          <View className="flex-1 pr-3">
            <Text className="text-base text-black">{b.blocked_alias}</Text>
            <Text className="text-xs text-neutral-500">
              {tr.safety.blockedSince(new Date(b.created_at).toLocaleDateString('tr-TR'))}
            </Text>
          </View>
          <Button
            variant="secondary"
            label={tr.safety.unblock}
            onPress={() => unblock.mutate(b.id)}
            disabled={unblock.isPending}
          />
        </View>
      ))}
    </View>
  );
}
