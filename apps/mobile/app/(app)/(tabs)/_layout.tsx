import { Ionicons } from '@expo/vector-icons';
import { venueTabTarget } from '@shared/navigation.ts';
import { router, Tabs } from 'expo-router';

import { TabBar, TabBarSpace } from '@/components/TabBar';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import {
  useFriends,
  useIncomingFriendRequests,
  useInbox,
  useVenueChatRequests,
} from '@/features/friends/queries';
import { tr } from '@/i18n/tr';

export { RouteError as ErrorBoundary } from '@/components/RouteError';

export const unstable_settings = { initialRouteName: 'explore' };

// Keşfet · Mekan · Arkadaşlar · Profil. Rooms, check-in and legal texts are full screen outside
// the tabs, so the tab bar is hidden there.
export default function TabsLayout() {
  const table = useActiveTable();
  useInbox();
  const incoming = useIncomingFriendRequests();
  const chatIncoming = useVenueChatRequests();
  const friends = useFriends();
  const waiting =
    (incoming.data?.length ?? 0) +
    (chatIncoming.data?.length ?? 0) +
    (friends.data?.filter((f) => f.unread).length ?? 0);

  return (
    <TabBarSpace>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <TabBar {...props} raised="venue" />}
      >
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen
          name="explore"
          options={{
            title: tr.tabs.explore,
            tabBarButtonTestID: 'tab-explore',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="compass-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="venue"
          options={{
            title: tr.tabs.venue,
            tabBarButtonTestID: 'tab-venue',
            // The Mekan disc (docs/SPEC_V2.md §2) with the snail, drawn by TabBar.
          }}
          listeners={{
            // Without an active table the Mekan tab opens Keşfet instead.
            tabPress: (event) => {
              const target = venueTabTarget(table.data, Date.now());
              if (target !== '/venue') {
                event.preventDefault();
                router.navigate(target);
              }
            },
          }}
        />
        <Tabs.Screen
          name="friends"
          options={{
            title: tr.tabs.friends,
            tabBarButtonTestID: 'tab-friends',
            tabBarBadge: waiting > 0 ? waiting : undefined,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: tr.tabs.profile,
            tabBarButtonTestID: 'tab-profile',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </TabBarSpace>
  );
}
