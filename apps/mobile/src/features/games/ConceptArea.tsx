import type { Concept } from '@shared/rooms.ts';
import { parseGameState } from '@shared/tabu.ts';
import { View } from 'react-native';

import { LocalTabu } from './LocalTabu';
import { SohbetCard } from './SohbetCard';
import { VoiceTabu } from './VoiceTabu';

type Props = {
  roomId: string;
  concept: Concept;
  gameState: unknown;
  hasGuest: boolean;
  isOwner: boolean;
  aliases: { owner: string; guest: string };
};

// The top of the room screen (MVP_SPEC §4.5). One-table Tabu runs locally; when a second table
// joins, the room switches to the server game, played face to face (docs/SPEC_V2.md §8.2).
export function ConceptArea({ roomId, concept, gameState, hasGuest, isOwner, aliases }: Props) {
  const state = parseGameState(gameState);
  return (
    <View className="mt-6 rounded-2xl bg-neutral-100 p-4">
      {concept === 'sohbet' ? (
        <SohbetCard
          roomId={roomId}
          isOwner={isOwner}
          state={state?.concept === 'sohbet' ? state : null}
        />
      ) : hasGuest ? (
        <VoiceTabu
          roomId={roomId}
          state={state}
          side={isOwner ? 'owner' : 'guest'}
          isOwner={isOwner}
          aliases={aliases}
        />
      ) : (
        <LocalTabu roomId={roomId} />
      )}
    </View>
  );
}
