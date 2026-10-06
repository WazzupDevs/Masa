import {
  CONCEPTS,
  type Concept,
  proposalNotAccepted,
  type ProposalView,
  proposalView,
} from '@shared/rooms.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { GAME_TONES, GameDisc, type GameGlyph, GameIcon } from '@/components/Glyph';
import { usePressScale } from '@/components/motion';
import { Text } from '@/components/Text';
import { roomKeys, useGameProposal } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { roomsApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

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
                variant="secondary"
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
          <View className="flex-row flex-wrap gap-2.5">
            {CONCEPTS.map((concept) => (
              <GameTile
                key={concept}
                concept={concept}
                onPress={() => propose.mutate(concept)}
                disabled={propose.isPending}
              />
            ))}
          </View>
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

// Each game's icon and colour pair (canvas: Aşama 6 · Oyunlar → Oyun ikonları).
const GLYPH: Record<Concept, GameGlyph> = {
  tabu: 'tabu',
  sohbet: 'sohbet',
  sahtekar: 'impostor',
  harf: 'letters',
  sarki: 'song',
};

function useGameColors(concept: Concept) {
  const { colors } = useTheme();
  const [bg, fg] = GAME_TONES[GLYPH[concept]];
  return { bg: colors[bg], fg: colors[fg], glyph: GLYPH[concept] };
}

function ConceptDisc({ concept }: { concept: Concept }) {
  return <GameDisc name={GLYPH[concept]} size={TOUCH.button} />;
}

// A game to propose: a colour tile with its icon and name. Canvas: the bar is titled "Oyun öner";
// each tile names only the game, the reader still hears the whole action.
function GameTile({
  concept,
  onPress,
  disabled,
}: {
  concept: Concept;
  onPress: () => void;
  disabled: boolean;
}) {
  const { shape } = useTheme();
  const pressScale = usePressScale();
  const c = useGameColors(concept);
  return (
    <Pressable
      testID={`propose-${concept}`}
      accessibilityRole="button"
      accessibilityLabel={tr.games.propose(tr.concepts[concept])}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ flexBasis: '30%', flexGrow: 1 }}
    >
      {({ pressed }) => (
        <View
          className="gap-2.5"
          style={[
            {
              minHeight: TOUCH.large + SPACING[6],
              padding: SPACING[3] + SPACING[0.5],
              borderRadius: shape.radius.lg,
              backgroundColor: c.bg,
              opacity: disabled ? 0.6 : 1,
            },
            pressScale(pressed),
          ]}
        >
          <GameIcon name={c.glyph} color={c.fg} size={ICON.lg} />
          <Text variant="heading" color={c.fg} numberOfLines={2}>
            {tr.concepts[concept]}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
