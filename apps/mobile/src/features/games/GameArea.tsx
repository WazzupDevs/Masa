import type { Concept } from '@shared/rooms.ts';
import { IBRE_CONFIG, parseIbreState } from '@shared/ibre.ts';
import { parseSahtekarState, SAHTEKAR } from '@shared/sahtekar.ts';
import { parseSayState, SAY_CONFIG } from '@shared/sayChallenge.ts';
import { parseBetweenGames, parseGameState, type TableSide } from '@shared/tabu.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { roomKeys } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track, trackOnce } from '@/lib/analytics';
import { gamesApi, roomsApi } from '@/lib/api';

import { IbreGame, RoundReveal } from './ibre/IbreGame';
import { LocalIbre } from './ibre/LocalIbre';
import { GAME_ORDER, GameCard, GameCell, GameGrid } from './GameCard';
import { LocalTabu } from './LocalTabu';
import { ProposalArea } from './ProposalArea';
import { RematchButton } from './RematchButton';
import { LocalSahtekar } from './sahtekar/LocalSahtekar';
import { ImposterReveal } from './sahtekar/Sahtekar';
import { SahtekarGame } from './sahtekar/SahtekarGame';
import { LocalSay } from './say/LocalSay';
import { SayGame } from './say/SayGame';
import { SohbetCard } from './SohbetCard';
import { VoiceTabu, VoiceTabuResult } from './VoiceTabu';

// The fewest players a one-table game takes (the games' own rules).
function soloMinPlayers(game: Concept): number {
  if (game === 'sahtekar') return SAHTEKAR.minPlayers;
  if (game === 'harf' || game === 'sarki') return SAY_CONFIG[game].minLocalPlayers;
  if (game === 'ibre') return IBRE_CONFIG.minLocalPlayers;
  return 1;
}

type Props = {
  roomId: string;
  sessionId: string;
  // The running game; null is chat (docs/SPEC_V3.md §5.1).
  concept: Concept | null;
  gameState: unknown;
  hasGuest: boolean;
  isOwner: boolean;
  aliases: Record<TableSide, string>;
  // The table's check-in headcount: the seats of one-table Sahtekar.
  headcount: number;
  // A one-table game run on this phone (LocalTabu, LocalSahtekar); the room screen keeps it so it
  // can lay the running game out full screen.
  localGame: LocalGame | null;
  onLocalGame: (game: LocalGame | null) => void;
};

export type LocalGame = 'tabu' | 'sahtekar' | 'harf' | 'sarki' | 'ibre';

// Whether a game is running: the room screen shows it full screen (canvas: Aşama 6 · Oyunlar).
export function isGameRunning(
  concept: Concept | null,
  hasGuest: boolean,
  localGame: LocalGame | null,
) {
  return concept !== null || (!hasGuest && localGame !== null);
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
  headcount,
  localGame,
  onLocalGame: setLocalGame,
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
  const lastScore =
    last?.concept === 'tabu' ? (last.scores?.owner ?? last.teamScore ?? null) : null;
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
  // Harf Kapmaca, Şarkıda Geçsin and İbre too (their round and rounds).
  const abandoned = last?.abandoned ?? null;
  const abandonedConcept = last?.concept ?? 'tabu';
  useEffect(() => {
    if (abandoned) {
      trackOnce(`game_abandoned:${roomId}:${between.gameNo}`, 'game_abandoned', {
        concept: abandonedConcept,
        turn_no: abandoned.turnNo,
        total_turns: abandoned.totalTurns,
      });
    }
  }, [abandoned, abandonedConcept, roomId, between.gameNo]);

  // A finished two-table Harf Kapmaca or Şarkıda Geçsin counts once, from the owner's phone: the
  // owner table's score, objections used and rounds lost on the clock (never the prompts).
  const sayLast = last?.say ?? null;
  const sayConcept = last?.concept === 'harf' || last?.concept === 'sarki' ? last.concept : null;
  const sayScore = sayConcept && !last?.abandoned ? (last?.scores?.owner ?? null) : null;
  useEffect(() => {
    if (isOwner && sayConcept && sayScore !== null && sayLast) {
      trackOnce(`game_completed:${roomId}:${between.gameNo}`, 'game_completed', {
        concept: sayConcept,
        mode: 'voice',
        score: sayScore,
        objections: sayLast.objections,
        rounds_lost_by_timeout: sayLast.timeouts,
      });
    }
  }, [isOwner, sayConcept, sayScore, sayLast, roomId, between.gameNo]);

  // A finished two-table İbre counts once, from the owner's phone: the owner table's score and its
  // 4-point rounds (never the scale or the target).
  const ibreLast = last?.concept === 'ibre' && !last.abandoned ? (last.ibre ?? null) : null;
  const ibreScore = ibreLast ? (last?.scores?.owner ?? null) : null;
  useEffect(() => {
    if (isOwner && ibreLast && ibreScore !== null) {
      trackOnce(`game_completed:${roomId}:${between.gameNo}`, 'game_completed', {
        concept: 'ibre',
        mode: 'voice',
        score: ibreScore,
        bullseyes: ibreLast.bullseyes.owner,
      });
    }
  }, [isOwner, ibreLast, ibreScore, roomId, between.gameNo]);

  // A finished two-table Sahtekar counts once, from the owner's phone: who won and how many played
  // (never the seat or the word).
  const sahtekarLast = last?.sahtekar ?? null;
  const revealed = sahtekarLast?.reveal ?? null;
  const sahtekarPlayers = sahtekarLast?.players
    ? sahtekarLast.players.owner + sahtekarLast.players.guest
    : 0;
  useEffect(() => {
    if (isOwner && revealed) {
      trackOnce(`game_completed:${roomId}:${between.gameNo}`, 'game_completed', {
        concept: 'sahtekar',
        mode: 'voice',
        outcome: revealed.winner,
        players: sahtekarPlayers,
      });
    }
  }, [isOwner, revealed, sahtekarPlayers, roomId, between.gameNo]);

  // "Rövanş" after a finished two-table game: the same game proposed again (§19.2); it starts when
  // the other table accepts. Sahtekar keeps this table's count from the last game (§20.1).
  const rematchConcept =
    last?.concept === 'sahtekar' ||
    last?.concept === 'harf' ||
    last?.concept === 'sarki' ||
    last?.concept === 'ibre'
      ? last.concept
      : 'tabu';
  const rematchPlayers = sahtekarLast?.players?.[side];
  const rematch = useMutation({
    mutationFn: () => roomsApi.proposeGame(roomId, rematchConcept, rematchPlayers),
    onSuccess: () => track('game_proposed', { concept: rematchConcept }),
    onSettled: refresh,
  });
  const canRematch =
    hasGuest &&
    ((last?.concept === 'tabu' && !last.abandoned) ||
      (last?.concept === 'sahtekar' && !!revealed) ||
      (!!sayConcept && !last?.abandoned) ||
      !!ibreLast);

  // The one-table game on this phone. A second table ends it (the room returns to chat), and so
  // does Sohbet kartları.
  const local: LocalGame | null = hasGuest || concept === 'sohbet' ? null : (localGame ?? concept);
  const state = parseGameState(gameState);

  const game =
    local === 'tabu' ? (
      <LocalTabu roomId={roomId} />
    ) : local === 'sahtekar' ? (
      <LocalSahtekar roomId={roomId} players={headcount} />
    ) : local === 'harf' || local === 'sarki' ? (
      <LocalSay roomId={roomId} kind={local} />
    ) : local === 'ibre' ? (
      <LocalIbre roomId={roomId} />
    ) : concept === 'ibre' ? (
      <IbreGame roomId={roomId} state={parseIbreState(gameState)} side={side} aliases={aliases} />
    ) : concept === 'harf' || concept === 'sarki' ? (
      <SayGame
        roomId={roomId}
        kind={concept}
        state={parseSayState(gameState)}
        side={side}
        aliases={aliases}
      />
    ) : concept === 'sahtekar' ? (
      <SahtekarGame roomId={roomId} state={parseSahtekarState(gameState)} side={side} />
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
      {revealed ? (
        <ImposterReveal
          imposter={revealed.imposter}
          word={revealed.word}
          guess={revealed.guess}
          outcome={revealed.winner}
          votes={Object.entries(revealed.votes).map(([voter, target]) => ({ voter, target }))}
          brand={tr.games.gameBrand(tr.concepts.sahtekar)}
        />
      ) : null}
      {ibreLast?.reveal ? (
        <RoundReveal
          reveal={ibreLast.reveal}
          guesser={aliases[ibreLast.reveal.table === 'owner' ? 'guest' : 'owner']}
          brand={tr.games.gameBrand(tr.concepts.ibre)}
        />
      ) : null}
      {last ? (
        <Card tone="note" testID="last-game">
          {sahtekarLast?.endedBy ? (
            <Text variant="fine" testID="sahtekar-not-enough">
              {tr.sahtekar.notEnough}
            </Text>
          ) : last.scores && hasGuest ? (
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
        // One table: the games as cards (canvas: Aşama 8 · Saha → Oyun listesi). A game the
        // headcount does not allow is faded with its reason.
        <Card>
          <View className="gap-3">
            <View className="gap-0.5">
              <Text variant="heading" accessibilityRole="header">
                {tr.games.soloTitle}
              </Text>
              <Text variant="fine">{tr.games.soloHint(headcount)}</Text>
            </View>
            <GameGrid>
              {GAME_ORDER.map((game) => {
                const min = soloMinPlayers(game);
                const short = headcount < min;
                return (
                  <GameCell key={game}>
                    <GameCard
                      concept={game}
                      testID={`solo-${game}`}
                      accessibilityLabel={tr.games.start(tr.concepts[game])}
                      disabled={short || (game === 'sohbet' && startSohbet.isPending)}
                      reason={short ? tr.games.minPlayers(min) : undefined}
                      onPress={() =>
                        game === 'sohbet' ? startSohbet.mutate() : setLocalGame(game)
                      }
                    />
                  </GameCell>
                );
              })}
            </GameGrid>
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
