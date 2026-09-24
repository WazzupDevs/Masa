import type { Concept } from '@shared/rooms.ts';
import { parseGameState } from '@shared/tabu.ts';
import { View } from 'react-native';

import { LocalTabu } from './LocalTabu';
import { ServerTabu } from './ServerTabu';
import { SohbetCard } from './SohbetCard';

type Props = {
  roomId: string;
  concept: Concept;
  gameState: unknown;
  hasGuest: boolean;
  sessionId: string;
  isOwner: boolean;
};

// The top of the room screen (MVP_SPEC §4.5). One-table Tabu runs locally; when a second table
// joins, the room switches to the server game and the local one is dropped (§5.1).
export function ConceptArea({ roomId, concept, gameState, hasGuest, sessionId, isOwner }: Props) {
  const state = parseGameState(gameState);
  return (
    <View className="mt-6 rounded-2xl bg-neutral-100 p-4">
      {concept === 'sohbet' ? (
        <SohbetCard roomId={roomId} state={state?.concept === 'sohbet' ? state : null} />
      ) : hasGuest ? (
        <ServerTabu
          roomId={roomId}
          state={state?.concept === 'tabu' ? state : null}
          sessionId={sessionId}
          isOwner={isOwner}
        />
      ) : (
        <LocalTabu roomId={roomId} />
      )}
    </View>
  );
}
