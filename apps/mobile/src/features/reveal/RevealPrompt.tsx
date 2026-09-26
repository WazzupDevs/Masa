import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Countdown } from '@/components/Countdown';
import { Quiet } from '@/components/Quiet';
import { Text } from '@/components/Text';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { trackOnce } from '@/lib/analytics';
import { revealApi } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useNow } from '@/lib/useNow';
import { REVEAL } from '@shared/reveal.ts';

type Props = { roomId: string; isOwner: boolean; revealEndsAt: string; score: number | null };

// "Tanışalım mı?" with a 30 second countdown (MVP_SPEC §4.6, screen 8). Only this table's own
// answer is ever readable. A table that said "Hayır" already knows the result and may leave at
// once; the room stays 'ending' for the other table until the window ends.
export function RevealPrompt({ roomId, isOwner, revealEndsAt, score }: Props) {
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
  const saidNo = myAnswer.data?.wants_meet === false;

  useEffect(() => {
    // The result is certainly "none"; counted once per room from the owner's phone, under the same
    // key RevealResult uses.
    if (saidNo && isOwner) trackOnce(`reveal:${roomId}`, 'reveal_none', {});
  }, [saidNo, isOwner, roomId]);

  if (saidNo) {
    return (
      <Quiet value>
        <Card className="mt-4">
          <View className="items-center gap-4 py-2">
            <Text variant="title" align="center">
              {tr.reveal.goodGame}
            </Text>
            <View className="self-stretch">
              <Button label={tr.reveal.backToVenue} onPress={() => router.replace('/venue')} />
            </View>
          </View>
        </Card>
      </Quiet>
    );
  }

  // A trust moment in every theme: hairline card, the rule spelled out, one clear "Evet".
  return (
    <Quiet value>
      <Card className="mt-4">
        <View className="items-center gap-3 py-1">
          {score !== null ? <Text variant="label">{tr.reveal.score(score)}</Text> : null}
          <Text variant="display" align="center" accessibilityRole="header">
            {tr.reveal.question}
          </Text>
          <Text variant="fine" align="center">
            {tr.reveal.hint}
          </Text>
          <Countdown
            secondsLeft={secondsLeft}
            totalSeconds={REVEAL.decisionSeconds}
            label={tr.reveal.secondsLeft(secondsLeft)}
          />
          {decide.isError ? (
            <Text variant="fine" tone="danger">
              {errorMessage(decide.error)}
            </Text>
          ) : null}
          {answered ? (
            <Card tone="note" className="self-stretch">
              <Text align="center" accessibilityLiveRegion="polite">
                {tr.reveal.answered}
              </Text>
            </Card>
          ) : (
            <View className="mt-1 flex-row gap-2.5 self-stretch">
              <View className="flex-1">
                <Button
                  variant="secondary"
                  label={tr.reveal.no}
                  onPress={() => decide.mutate(false)}
                  disabled={decide.isPending || secondsLeft === 0}
                />
              </View>
              <View className="flex-1">
                <Button
                  label={tr.reveal.yes}
                  onPress={() => decide.mutate(true)}
                  disabled={decide.isPending || secondsLeft === 0}
                />
              </View>
            </View>
          )}
        </View>
      </Card>
    </Quiet>
  );
}
