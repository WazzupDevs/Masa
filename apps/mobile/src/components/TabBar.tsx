import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

import { Text } from './Text';

// The mockup's tab bar: 76 high, and the raised Mekan disc (60) lifted 26 above it.
const BAR_HEIGHT = 76;
const VENUE_DISC = 60;
const VENUE_LIFT = 26;
const BADGE = 18;

type Props = BottomTabBarProps & {
  // The route drawn as the raised, highlighted middle button (docs/SPEC_V2.md §2).
  raised: string;
};

// Keşfet · Mekan · Arkadaşlar · Profil. Presses go through `tabPress`, so screen listeners (the
// Mekan tab's redirect) still decide where a tap leads.
export function TabBar({ state, descriptors, navigation, insets, raised }: Props) {
  const { colors, shape } = useTheme();

  const routes = state.routes.filter((route) => {
    const item = StyleSheet.flatten(descriptors[route.key]?.options.tabBarItemStyle);
    return item?.display !== 'none';
  });

  return (
    <View
      accessibilityRole="tablist"
      className="flex-row items-end"
      style={{
        minHeight: BAR_HEIGHT + insets.bottom,
        paddingBottom: SPACING[3] + insets.bottom,
        paddingHorizontal: SPACING[2],
        backgroundColor: colors.surface,
        borderTopWidth: Math.max(shape.stroke.hairline, shape.stroke.card),
        borderTopColor: shape.stroke.card > 1 ? colors.border : colors.divider,
      }}
    >
      {routes.map((route) => {
        const descriptor = descriptors[route.key];
        if (!descriptor) return null;
        const { options } = descriptor;
        const focused = state.routes[state.index]?.key === route.key;
        const label = options.title ?? route.name;
        const badge = options.tabBarBadge;
        const isRaised = route.name === raised;
        const color = isRaised ? colors.onAccent : focused ? colors.text : colors.muted;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };

        const icon = options.tabBarIcon?.({
          focused,
          color,
          size: isRaised ? ICON.xl : ICON.lg,
        });

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={
              options.tabBarAccessibilityLabel ?? (badge ? `${label}, ${badge}` : label)
            }
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            style={{
              flex: 1,
              minHeight: TOUCH.tab,
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: SPACING[0.5],
            }}
          >
            {isRaised ? (
              <View
                className="items-center justify-center"
                style={{
                  width: VENUE_DISC,
                  height: VENUE_DISC,
                  marginTop: -VENUE_LIFT,
                  borderRadius: shape.radius.pill,
                  backgroundColor: colors.accent,
                  borderWidth: shape.stroke.venueRing,
                  borderColor: shape.stroke.card > 1 ? colors.border : colors.surface,
                  boxShadow: shape.shadow.venueButton,
                }}
              >
                {icon}
              </View>
            ) : (
              <View>
                {icon}
                {badge !== undefined ? (
                  <View
                    className="absolute items-center justify-center"
                    style={{
                      top: -SPACING[1],
                      left: ICON.lg - SPACING[1.5],
                      minWidth: BADGE,
                      height: BADGE,
                      paddingHorizontal: SPACING[1],
                      borderRadius: shape.radius.pill,
                      backgroundColor: colors.danger,
                    }}
                  >
                    <Text variant="caption" tone="onDanger">
                      {String(badge)}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
            <Text variant="caption" tone={focused || isRaised ? 'text' : 'muted'}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
