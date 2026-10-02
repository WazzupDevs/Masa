import { venueTabTarget } from '@shared/navigation.ts';
import { router, Tabs } from 'expo-router';

import { TabBar, TabBarSpace } from '@/components/TabBar';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { useInbox, useUnreadTotal } from '@/features/friends/queries';
import { tr } from '@/i18n/tr';

export { RouteError as ErrorBoundary } from '@/components/RouteError';

export const unstable_settings = { initialRouteName: 'explore' };

// Keşfet · Aktiviteler · Mekan · Mesajlar · Profil (docs/SPEC_V3.md §18.3). TabBar draws each
// tab's icon from the route name. Rooms, check-in, Bildirimler and legal texts are full screen
// outside the tabs, so the tab bar is hidden there; a DM hides it itself.
export default function TabsLayout() {
  const table = useActiveTable();
  useInbox();
  const unread = useUnreadTotal();

  return (
    <TabBarSpace>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <TabBar {...props} raised="venue" />}
      >
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen
          name="explore"
          options={{ title: tr.tabs.explore, tabBarButtonTestID: 'tab-explore' }}
        />
        <Tabs.Screen
          name="activities"
          options={{ title: tr.tabs.activities, tabBarButtonTestID: 'tab-activities' }}
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
          name="messages"
          options={{
            title: tr.tabs.messages,
            tabBarButtonTestID: 'tab-messages',
            tabBarBadge: unread > 0 ? unread : undefined,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: tr.tabs.profile, tabBarButtonTestID: 'tab-profile' }}
        />
      </Tabs>
    </TabBarSpace>
  );
}
