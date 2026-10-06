import type { Concept } from '@shared/rooms.ts';
import { parseBetweenGames, parseGameState, type TableSide } from '@shared/tabu.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { roomKeys } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track, trackOnce } from '@/lib/analytics';
import { gamesApi, roomsApi } from '@/lib/api';

import { LocalTabu } from './LocalTabu';
import { ProposalArea } from './ProposalArea';
import { RematchButton } from './RematchButton';
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
  // One-table Tabu runs on this phone (LocalTabu); the room screen keeps the flag so it can lay
  // the running game out full screen.
  localTabu: boolean;
  onLocalTabu: (on: boolean) => void;
};

// Whether a game is running: the room screen shows it full screen (canvas: Aşama 6 · Oyunlar).
export function isGameRunning(concept: Concept | null, hasGuest: boolean, localTabu: boolean) {
  return concept !== null || (!hasGuest && localTabu);
}

// "Oyunu bitir" (after the confirmation in GameStage): the room returns to chat.
export function useEndGame(roomId: string, onEnded: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      onEnded();
      return roomsApi.endGame(roomId);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: roomKeys.room(roomId) }),
  });
}

// The top of the room screen. Between games: the last result, then "Oyun öner" in a two-table room
// (a game starts only when the other table accepts, §5.3) or the games themselves in a one-table
// room. During a game: the game only; the room screen puts it on the full-screen stage with
// "Oyunu bitir".
export function GameArea({
  roomId,
  sessionId,
  concept,
  gameState,
  hasGuest,
  isOwner,
  aliases,
  localTabu,
  onLocalTabu: setLocalTabu,
}: Props) {
  const queryClient = useQueryClient();
  const side: TableSide = isOwner ? 'owner' : 'guest';

  const refresh = () => void queryClient.invalidateQueries({ queryKey: roomKeys.room(roomId) });
  const startSohbet = useMutation({
    mutationFn: () => gamesApi.sohbetNext(roomId),
    onSettled: refresh,
  });

  const between = parseBetweenGames(gameState);
  const last = between.lastGame;
  // A finished two-table Tabu counts once, from the owner's phone (room-level events): the owner
  // table's score, or the team's in the cooperative mode.
  const lastScore = last?.scores?.owner ?? last?.teamScore ?? null;
  useEffect(() => {
    if (isOwner && lastScore !== null) {
      trackOnce(`game_completed:${roomId}:${between.gameNo}`, 'game_completed', {
        concept: 'tabu',
        mode: 'voice',
        score: lastScore,
        tabu_mode: last?.teamScore !== null ? 'cooperative' : 'refereed',
      });
    }
  }, [isOwner, lastScore, last?.teamScore, roomId, between.gameNo]);
  // A Tabu game stopped with "Oyunu bitir" before its last turn (docs/SPEC_V3.md §19.1): each
  // phone counts it once for its own user.
  const abandoned = last?.abandoned ?? null;
  useEffect(() => {
    if (abandoned) {
      trackOnce(`game_abandoned:${roomId}:${between.gameNo}`, 'game_abandoned', {
        concept: 'tabu',
        turn_no: abandoned.turnNo,
        total_turns: abandoned.totalTurns,
      });
    }
  }, [abandoned, roomId, between.gameNo]);

  // "Rövanş" after a finished two-table Tabu: the same game proposed again (§19.2); it starts when
  // the other table accepts.
  const rematch = useMutation({
    mutationFn: () => roomsApi.proposeGame(roomId, 'tabu'),
    onSuccess: () => track('game_proposed', { concept: 'tabu' }),
    onSettled: refresh,
  });
  const canRematch = hasGuest && last?.concept === 'tabu' && !last.abandoned;

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

  if (game) return <View className="gap-3">{game}</View>;

  return (
    <View className="mt-4 gap-3">
      {last ? (
        <Card tone="note" testID="last-game">
          {last.scores && hasGuest ? (
            <VoiceTabuResult scores={last.scores} side={side} aliases={aliases} />
          ) : last.teamScore !== null ? (
            <Text variant="fine">{tr.games.lastGameTeam(last.teamScore)}</Text>
          ) : (
            <Text variant="fine">{tr.games.lastGameOther(tr.concepts[last.concept])}</Text>
          )}
          {canRematch ? (
            <View className="mt-3 gap-2">
              <RematchButton
                onPress={() => rematch.mutate()}
                loading={rematch.isPending}
                disabled={rematch.isPending}
              />
              {rematch.isError ? (
                <Text variant="fine" tone="danger">
                  {errorMessage(rematch.error)}
                </Text>
              ) : null}
            </View>
          ) : null}
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
