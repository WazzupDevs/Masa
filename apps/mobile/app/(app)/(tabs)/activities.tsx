import type { Intent } from '@shared/rooms.ts';
import { hasActiveTable } from '@shared/navigation.ts';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { Rise } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Sheet } from '@/components/Sheet';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { type RecentGame, useRecentGames } from '@/features/activities/useRecentGames';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { NotificationsBell } from '@/features/notifications/Bell';
import { useCreateSolo } from '@/features/rooms/useCreateSolo';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { useNow } from '@/lib/useNow';

type Game = 'tabu' | 'sohbet' | 'sahtekar' | 'harf' | 'sarki' | 'ibre';

// The intent "Bu oyunla oda kur" opens the room form with (the room still starts without a game).
const INTENT_OF: Record<Game, Intent> = {
  tabu: 'game',
  sohbet: 'chat',
  sahtekar: 'game',
  harf: 'game',
  sarki: 'game',
  ibre: 'game',
};

// Aktiviteler, the game hub (docs/SPEC_V3.md §18.3; canvas: Aşama 5 · Geri bildirim): one card per
// game with a short line and how it is played. At the venue: "Masanla oyna" (the one-table room
// of the venue screen) and "Bu oyunla oda kur"; otherwise "Oynamak için mekana gir". Below, the
// caller's own recent games; the section is left out when there are none. No new game or content.
export default function ActivitiesScreen() {
  const table = useActiveTable();
  const now = useNow(30_000);
  const atVenue = hasActiveTable(table.data, now);
  const solo = useCreateSolo();
  const recent = useRecentGames();
  const [howTo, setHowTo] = useState<Game | null>(null);

  const games: Game[] = ['tabu', 'sahtekar', 'harf', 'sarki', 'ibre', 'sohbet'];

  return (
    <Screen edges={['top']}>
      <ScreenHeader title={tr.tabs.activities} trailing={<NotificationsBell />} />

      <View className="mt-3 gap-4">
        {games.map((game, i) => (
          <Rise key={game} index={i}>
            <Card tone={game === 'tabu' ? 'feature' : 'card'}>
              <View className="gap-3">
                <Text variant="title" accessibilityRole="header">
                  {tr.concepts[game]}
                </Text>
                <Text>{tr.activities[game].body}</Text>
                <View className="self-start">
                  <Button
                    variant="ghost"
                    tight
                    icon="chevron-forward"
                    label={tr.activities.howTo}
                    onPress={() => setHowTo(game)}
                  />
                </View>
                {atVenue ? (
                  <View className="gap-2.5">
                    <Button
                      variant={game === 'tabu' ? 'primary' : 'secondary'}
                      label={tr.rooms.playWithTable}
                      loading={solo.isPending}
                      disabled={solo.isPending}
                      onPress={() => solo.mutate()}
                      testID={`activities-solo-${game}`}
                    />
                    <Button
                      variant="secondary"
                      label={tr.activities.createWith}
                      onPress={() =>
                        router.push({ pathname: '/room/new', params: { intent: INTENT_OF[game] } })
                      }
                      testID={`activities-create-${game}`}
                    />
                  </View>
                ) : (
                  <Button
                    variant="secondary"
                    label={tr.activities.goToVenue}
                    onPress={() => router.navigate('/explore')}
                    testID={`activities-venue-${game}`}
                  />
                )}
              </View>
            </Card>
          </Rise>
        ))}
        {solo.isError ? (
          <Text variant="fine" tone="danger">
            {errorMessage(solo.error)}
          </Text>
        ) : null}

        {recent.data && recent.data.length > 0 ? (
          <View className="mt-2 gap-3">
            <Text variant="heading" accessibilityRole="header">
              {tr.activities.recent}
            </Text>
            {recent.data.map((g) => (
              <RecentRow key={g.id} game={g} />
            ))}
          </View>
        ) : null}
      </View>

      <Sheet
        visible={howTo !== null}
        onClose={() => setHowTo(null)}
        title={howTo ? tr.concepts[howTo] : ''}
      >
        <View className="gap-2.5">
          {(howTo ? tr.activities[howTo].steps : []).map((step) => (
            <Text key={step}>{step}</Text>
          ))}
        </View>
        <Button variant="ghost" label={tr.common.close} onPress={() => setHowTo(null)} />
      </Sheet>
    </Screen>
  );
}

function RecentRow({ game }: { game: RecentGame }) {
  const label = tr.concepts[game.concept];
  return (
    <ListRow
      card
      title={label}
      meta={tr.activities.recentRow(game.otherAlias, game.completedAt)}
      leading={
        game.otherAlias ? (
          <Avatar kind="table" alias={game.otherAlias} size="lg" />
        ) : (
          <Avatar kind="table" alias={label} size="lg" />
        )
      }
      trailing={
        game.score !== null ? (
          <View accessible accessibilityLabel={game.won ? tr.activities.won : undefined}>
            <Tag
              variant={game.won ? 'accent' : 'neutral'}
              label={tr.activities.score(game.score)}
            />
          </View>
        ) : undefined
      }
    />
  );
}
