import { Ionicons } from '@expo/vector-icons';
import { venueTabTarget } from '@shared/navigation.ts';
import { router, Tabs } from 'expo-router';
import { View } from 'react-native';

import { useActiveTable } from '@/features/checkin/useActiveTable';
import { useFriends, useIncomingFriendRequests, useInbox } from '@/features/friends/queries';
import { tr } from '@/i18n/tr';

export { RouteError as ErrorBoundary } from '@/components/RouteError';

export const unstable_settings = { initialRouteName: 'explore' };

// The highlighted middle tab (docs/SPEC_V2.md §2).
function VenueIcon({ focused }: { focused: boolean }) {
  return (
    <View
      className={`-mt-5 h-14 w-14 items-center justify-center rounded-full ${focused ? 'bg-black' : 'bg-neutral-800'}`}
    >
      <Ionicons name="cafe" color="white" size={28} />
    </View>
  );
}

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
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: 'black' }}>
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
        options={{ title: tr.tabs.venue, tabBarIcon: VenueIcon }}
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
            <Ionicons name="person-circle-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
