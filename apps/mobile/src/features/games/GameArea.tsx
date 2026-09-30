import type { Concept } from '@shared/rooms.ts';
import { parseBetweenGames, parseGameState, type TableSide } from '@shared/tabu.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { roomKeys } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { trackOnce } from '@/lib/analytics';
import { gamesApi, roomsApi } from '@/lib/api';

import { LocalTabu } from './LocalTabu';
import { ProposalArea } from './ProposalArea';
import { SohbetCard } from './SohbetCard';
import { VoiceTabu, VoiceTabuResult } from './VoiceTabu';

type Props = {
  roomId: string;
  sessionId: string;
  // The running game; null is chat (docs/SPEC_V3.md §5.1).
  concept: Concept | null;
  gameState: unknown;
  hasGuest: boolean;
  isOwner: boolean;
  aliases: Record<TableSide, string>;
};

// The top of the room screen. Between games: the last result, then "Oyun öner" in a two-table room
// (a game starts only when the other table accepts, §5.3) or the games themselves in a one-table
// room. During a game: the game and "Oyunu bitir".
export function GameArea({
  roomId,
  sessionId,
  concept,
  gameState,
  hasGuest,
  isOwner,
  aliases,
}: Props) {
  const queryClient = useQueryClient();
  const side: TableSide = isOwner ? 'owner' : 'guest';
  // One-table Tabu runs on this phone; it starts here and keeps its place when the room's concept
  // turns to 'tabu', so the deck is not dealt twice.
  const [localTabu, setLocalTabu] = useState(false);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: roomKeys.room(roomId) });
  const endGame = useMutation({ mutationFn: () => roomsApi.endGame(roomId), onSettled: refresh });
  const startSohbet = useMutation({
    mutationFn: () => gamesApi.sohbetNext(roomId),
    onSettled: refresh,
  });

  const between = parseBetweenGames(gameState);
  const last = between.lastGame;
  const lastScores = last?.scores;
  // A finished two-table Tabu counts once, from the owner's phone (room-level events).
  useEffect(() => {
    if (isOwner && lastScores) {
      trackOnce(`game_completed:${roomId}:${between.gameNo}`, 'game_completed', {
        concept: 'tabu',
        mode: 'voice',
        score: lastScores.owner,
      });
    }
  }, [isOwner, lastScores, roomId, between.gameNo]);

  // A second table ends the local game (the room returns to chat), and so does Sohbet kartları.
  const showLocalTabu = !hasGuest && concept !== 'sohbet' && (concept === 'tabu' || localTabu);
  const state = parseGameState(gameState);

  const game = showLocalTabu ? (
    <LocalTabu roomId={roomId} />
  ) : concept === 'sohbet' ? (
    <SohbetCard
      roomId={roomId}
      isOwner={isOwner}
      state={state?.concept === 'sohbet' ? state : null}
    />
  ) : concept === 'tabu' ? (
    <VoiceTabu roomId={roomId} state={state} side={side} aliases={aliases} />
  ) : null;

  if (game) {
    return (
      <View className="mt-4 gap-3">
        {game}
        {endGame.isError ? (
          <Text variant="fine" tone="danger">
            {errorMessage(endGame.error)}
          </Text>
        ) : null}
        <Button
          variant="ghost"
          testID="end-game"
          label={tr.games.endGame}
          onPress={() => {
            setLocalTabu(false);
            endGame.mutate();
          }}
          disabled={endGame.isPending}
        />
      </View>
    );
  }

  return (
    <View className="mt-4 gap-3">
      {last ? (
        <Card tone="note" testID="last-game">
          {last.scores && hasGuest ? (
            <VoiceTabuResult scores={last.scores} side={side} aliases={aliases} />
          ) : (
            <Text variant="fine">{tr.games.lastGameOther(tr.concepts[last.concept])}</Text>
          )}
        </Card>
      ) : null}
      {hasGuest ? (
        <ProposalArea roomId={roomId} sessionId={sessionId} gameRunning={concept !== null} />
      ) : (
        <Card>
          <View className="gap-3">
            <Text variant="label" accessibilityRole="header">
              {tr.games.soloTitle}
            </Text>
            <Text variant="fine">{tr.games.localIntro}</Text>
            <Button
              testID="solo-tabu"
              label={tr.games.start(tr.concepts.tabu)}
              onPress={() => setLocalTabu(true)}
            />
            <Button
              variant="secondary"
              testID="solo-sohbet"
              label={tr.games.start(tr.concepts.sohbet)}
              onPress={() => startSohbet.mutate()}
              loading={startSohbet.isPending}
            />
            {startSohbet.isError ? (
              <Text variant="fine" tone="danger">
                {errorMessage(startSohbet.error)}
              </Text>
            ) : null}
          </View>
        </Card>
      )}
    </View>
  );
}
