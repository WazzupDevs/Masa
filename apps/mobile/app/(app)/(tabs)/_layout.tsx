import { Ionicons } from '@expo/vector-icons';
import { venueTabTarget } from '@shared/navigation.ts';
import { router, Tabs } from 'expo-router';

import { TabBar } from '@/components/TabBar';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { useFriends, useIncomingFriendRequests, useInbox } from '@/features/friends/queries';
import { tr } from '@/i18n/tr';

export { RouteError as ErrorBoundary } from '@/components/RouteError';

export const unstable_settings = { initialRouteName: 'explore' };

// Keşfet · Mekan · Arkadaşlar · Profil. Rooms, check-in and legal texts are full screen outside
// the tabs, so the tab bar is hidden there.
export default function TabsLayout() {
  const table = useActiveTable();
  useInbox();
  const incoming = useIncomingFriendRequests();
  const friends = useFriends();
  const waiting =
    (incoming.data?.length ?? 0) + (friends.data?.filter((f) => f.unread).length ?? 0);

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} raised="venue" />}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="explore"
        options={{
          title: tr.tabs.explore,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="venue"
        options={{
          title: tr.tabs.venue,
          // The raised middle button (docs/SPEC_V2.md §2), drawn by TabBar.
          tabBarIcon: ({ color, size }) => <Ionicons name="cafe" color={color} size={size} />,
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
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
