import {
  CONCEPTS,
  type Concept,
  proposalNotAccepted,
  type ProposalView,
  proposalView,
} from '@shared/rooms.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { GameDisc } from '@/components/Glyph';
import { Text } from '@/components/Text';
import { roomKeys, useGameProposal } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { roomsApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';
import { TOUCH } from '@/theme/tokens';

import { GAME_GLYPH, GAME_ORDER, GameCard, GameCell, GameGrid } from './GameCard';

// How long "Öneri kabul edilmedi" stays on the proposer's screen.
const NOT_ACCEPTED_MS = 6000;

type Props = { roomId: string; sessionId: string; gameRunning: boolean };

// "Oyun öner" in a two-table room (docs/SPEC_V3.md §5.3): one table proposes, the other accepts or
// not. A decline and a timeout show the proposer the same text; the decline at once (S7).
export function ProposalArea({ roomId, sessionId, gameRunning }: Props) {
  const queryClient = useQueryClient();
  const proposal = useGameProposal(roomId);
  const now = useNow(1000);
  const view = proposalView(proposal.data, sessionId, now);

  const previous = useRef<ProposalView>(view);
  const [notAcceptedUntil, setNotAcceptedUntil] = useState(0);
  useEffect(() => {
    if (proposalNotAccepted(previous.current, view, gameRunning)) {
      setNotAcceptedUntil(Date.now() + NOT_ACCEPTED_MS);
    }
    previous.current = view;
  }, [view, gameRunning]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: roomKeys.proposal(roomId) });
    void queryClient.invalidateQueries({ queryKey: roomKeys.room(roomId) });
  };
  const propose = useMutation({
    mutationFn: (concept: Concept) => roomsApi.proposeGame(roomId, concept),
    onSuccess: (_data, concept) => track('game_proposed', { concept }),
    onSettled: refresh,
  });
  const answer = useMutation({
    mutationFn: ({ accept }: { accept: boolean; concept: Concept }) =>
      roomsApi.answerGame(roomId, accept),
    onSuccess: (_data, { accept, concept }) => {
      if (accept) track('game_accepted', { concept });
    },
    onSettled: refresh,
  });
  const error = propose.error ?? answer.error;

  return (
    // Canvas (Aşama 4): the room's featured card, pinned over the chat.
    <Card tone="feature" className="mt-1">
      {view.kind === 'theirs' ? (
        <View className="gap-3">
          <View className="flex-row items-center gap-3">
            <ConceptDisc concept={view.concept} />
            <Text variant="bodyStrong" accessibilityLiveRegion="polite" className="flex-1">
              {tr.games.proposalTheirs(tr.concepts[view.concept])}
            </Text>
          </View>
          <View className="flex-row gap-2.5">
            <View className="flex-1">
              <Button
                variant="neutral"
                testID="proposal-decline"
                label={tr.games.declineProposal}
                onPress={() => answer.mutate({ accept: false, concept: view.concept })}
                disabled={answer.isPending}
              />
            </View>
            <View className="flex-1">
              <Button
                testID="proposal-accept"
                label={tr.games.acceptProposal}
                onPress={() => answer.mutate({ accept: true, concept: view.concept })}
                loading={answer.isPending}
              />
            </View>
          </View>
        </View>
      ) : view.kind === 'mine' ? (
        <Text accessibilityLiveRegion="polite">
          {tr.games.proposalMine(tr.concepts[view.concept], view.secondsLeft)}
        </Text>
      ) : (
        <View className="gap-3">
          <View className="gap-0.5">
            <Text variant="heading" accessibilityRole="header">
              {tr.games.proposeTitle}
            </Text>
            {now < notAcceptedUntil ? (
              <Text variant="fine" accessibilityLiveRegion="polite" testID="proposal-not-accepted">
                {tr.games.notAccepted}
              </Text>
            ) : (
              <Text variant="fine">{tr.games.proposeHint}</Text>
            )}
          </View>
          <GameGrid>
            {GAME_ORDER.filter((c) => CONCEPTS.includes(c)).map((concept) => (
              <GameCell key={concept}>
                <GameCard
                  concept={concept}
                  testID={`propose-${concept}`}
                  accessibilityLabel={tr.games.propose(tr.concepts[concept])}
                  onPress={() => propose.mutate(concept)}
                  disabled={propose.isPending}
                />
              </GameCell>
            ))}
          </GameGrid>
        </View>
      )}
      {error ? (
        <Text variant="fine" tone="danger" className="mt-2">
          {errorMessage(error)}
        </Text>
      ) : null}
    </Card>
  );
}

function ConceptDisc({ concept }: { concept: Concept }) {
  return <GameDisc name={GAME_GLYPH[concept]} size={TOUCH.button} />;
}
