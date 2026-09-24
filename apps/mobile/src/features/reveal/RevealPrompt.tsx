import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { revealApi } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useNow } from '@/lib/useNow';

type Props = { roomId: string; revealEndsAt: string; score: number | null };

// "Tanışalım mı?" with a 60 second countdown (MVP_SPEC §4.6, screen 8). Only this table's own
// answer is ever readable.
export function RevealPrompt({ roomId, revealEndsAt, score }: Props) {
  const queryClient = useQueryClient();
  const now = useNow(250);
  const secondsLeft = Math.max(0, Math.ceil((Date.parse(revealEndsAt) - now) / 1000));

  const myAnswer = useQuery({
    queryKey: ['revealDecision', roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reveal_decisions')
        .select('wants_meet')
        .eq('room_id', roomId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const decide = useMutation({
    mutationFn: (wantsMeet: boolean) => revealApi.decide(roomId, wantsMeet),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['revealDecision', roomId] }),
  });

  // Either table closes the window when the time is up; the server is idempotent.
  const finalized = useRef(false);
  useEffect(() => {
    if (secondsLeft === 0 && !finalized.current) {
      finalized.current = true;
      void revealApi.finalize(roomId);
    }
  }, [secondsLeft, roomId]);

  const answered = myAnswer.data !== null && myAnswer.data !== undefined;

  return (
    <View className="mt-6 items-center gap-4 rounded-2xl bg-neutral-100 p-6">
      {score !== null ? (
        <Text className="text-lg text-neutral-700">{tr.reveal.score(score)}</Text>
      ) : null}
      <Text className="text-3xl font-bold text-black">{tr.reveal.question}</Text>
      <Text className="text-center text-sm text-neutral-500">{tr.reveal.hint}</Text>
      <Text className="text-base font-semibold text-black">
        {tr.reveal.secondsLeft(secondsLeft)}
      </Text>
      {decide.isError ? (
        <Text className="text-sm text-red-600">{errorMessage(decide.error)}</Text>
      ) : null}
      {answered ? (
        <Text className="text-base text-neutral-600">{tr.reveal.answered}</Text>
      ) : (
        <View className="w-full flex-row gap-3">
          <View className="flex-1">
            <Button
              label={tr.reveal.yes}
              onPress={() => decide.mutate(true)}
              disabled={decide.isPending || secondsLeft === 0}
            />
          </View>
          <View className="flex-1">
            <Button
              variant="secondary"
              label={tr.reveal.no}
              onPress={() => decide.mutate(false)}
              disabled={decide.isPending || secondsLeft === 0}
            />
          </View>
        </View>
      )}
    </View>
  );
}
