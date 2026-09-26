import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { ListRow } from '@/components/ListRow';
import { Text } from '@/components/Text';
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
    <View>
      <Text variant="heading" accessibilityRole="header">
        {tr.safety.blockedTitle}
      </Text>
      {blocks.data?.length === 0 ? (
        <Text variant="fine" className="mt-2">
          {tr.safety.blockedEmpty}
        </Text>
      ) : null}
      {blocks.data?.map((b) => (
        <ListRow
          key={b.id}
          title={b.blocked_alias}
          meta={tr.safety.blockedSince(new Date(b.created_at).toLocaleDateString('tr-TR'))}
          trailing={
            <Button
              variant="secondary"
              label={tr.safety.unblock}
              onPress={() => unblock.mutate(b.id)}
              disabled={unblock.isPending}
            />
          }
        />
      ))}
    </View>
  );
}
