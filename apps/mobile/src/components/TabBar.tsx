import { useFocusEffect } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { useReduceMotion } from '@/lib/useReduceMotion';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

import { FADE_IMAGE, type TabGlyph, TabIcon } from './Glyph';
import { Snail, SnailLineIcon } from './Snail';
import { Text } from './Text';

// The floating capsule (canvas: Aşama 1 · Son → Sekme çubuğu, option 1): 16 in from the screen
// edges, 8 above the safe area, fully rounded; an opaque surface with a soft shadow and no top
// line. Content scrolls behind it and fades into the canvas (one stretched, tinted gradient image:
// no native gradient module); over the Keşfet map there is no fade. The Mekan disc sits inside it.
export const TAB_BAR_HEIGHT = TOUCH.large;
const INSET = SPACING[4];
const GAP = SPACING[2];
const PILL = { width: 76, height: 52 } as const;
const VENUE_DISC = SPACING[10];
const BADGE = 18;
const FADE_HEIGHT = 128;

// The tab icon of each route; the Arkadaşlar tab uses the Mesajlar icon. Other routes fall back to
// their `tabBarIcon` option.
const ROUTE_GLYPH: Partial<Record<string, TabGlyph>> = {
  explore: 'explore',
  activities: 'activities',
  friends: 'messages',
  messages: 'messages',
  profile: 'profile',
};

// Screens that change the bar while focused: a DM hides it (its message bar sits at the bottom),
// the Keşfet map drops the fade (the card and the bar sit right on the map). Counters, so a screen
// that blurs late cannot undo the next one's request.
const useBarMode = create<{ hidden: number; overMap: number }>(() => ({ hidden: 0, overMap: 0 }));

function useBarModeWhileFocused(key: 'hidden' | 'overMap', on: boolean) {
  useFocusEffect(
    useCallback(() => {
      if (!on) return undefined;
      useBarMode.setState((s) => ({ [key]: s[key] + 1 }));
      return () => useBarMode.setState((s) => ({ [key]: s[key] - 1 }));
    }, [key, on]),
  );
}

export function useHideTabBar(): void {
  useBarModeWhileFocused('hidden', true);
}

export function useTabBarOverMap(on: boolean): void {
  useBarModeWhileFocused('overMap', on);
}

// How much room the bar takes at the bottom of a tab screen (Screen pads by it); none while hidden.
const TabBarSpaceContext = createContext(0);

export function useTabBarSpace(): number {
  return useContext(TabBarSpaceContext);
}

export function TabBarSpace({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const hidden = useBarMode((s) => s.hidden > 0);
  return (
    <TabBarSpaceContext.Provider
      value={hidden ? 0 : TAB_BAR_HEIGHT + GAP + insets.bottom + SPACING[4]}
    >
      {children}
    </TabBarSpaceContext.Provider>
  );
}

type Props = BottomTabBarProps & {
  // The route drawn as the Mekan disc (docs/SPEC_V2.md §2).
  raised: string;
};

// Keşfet · Mekan · Arkadaşlar · Profil. Presses go through `tabPress`, so screen listeners (the
// Mekan tab's redirect) still decide where a tap leads.
export function TabBar({ state, descriptors, navigation, insets, raised }: Props) {
  const { colors, shape } = useTheme();
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);
  const [x] = useState(() => new Animated.Value(0));
  const hidden = useBarMode((s) => s.hidden > 0);
  const overMap = useBarMode((s) => s.overMap > 0);

  const routes = state.routes.filter((route) => {
    const item = StyleSheet.flatten(descriptors[route.key]?.options.tabBarItemStyle);
    return item?.display !== 'none';
  });
  const focusedKey = state.routes[state.index]?.key;
  const index = Math.max(
    0,
    routes.findIndex((r) => r.key === focusedKey),
  );
  const onVenue = routes[index]?.name === raised;
  const slot = (width - SPACING[4]) / Math.max(routes.length, 1);
  const target = SPACING[2] + slot * index + slot / 2 - PILL.width / 2;

  // The selected pill slides to the new tab (about 250 ms, springy); at once with reduce motion.
  useEffect(() => {
    if (!width) return;
    if (reduce) {
      x.setValue(target);
      return;
    }
    Animated.spring(x, {
      toValue: target,
      useNativeDriver: true,
      damping: 18,
      stiffness: 260,
      mass: 0.8,
    }).start();
  }, [target, width, reduce, x]);

  if (hidden) return null;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      {overMap ? null : (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <Image
            source={FADE_IMAGE}
            accessible={false}
            resizeMode="stretch"
            style={{ width: '100%', height: FADE_HEIGHT, tintColor: colors.canvas }}
          />
          <View style={{ height: insets.bottom, backgroundColor: colors.canvas }} />
        </View>
      )}
      <View
        accessibilityRole="tablist"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        className="flex-row"
        style={{
          marginHorizontal: INSET,
          marginBottom: insets.bottom + GAP,
          height: TAB_BAR_HEIGHT,
          paddingHorizontal: SPACING[2],
          borderRadius: shape.radius.pill,
          backgroundColor: colors.surface,
          boxShadow: shape.shadow.tabBar,
        }}
      >
        {width ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: (TAB_BAR_HEIGHT - PILL.height) / 2,
              left: 0,
              width: PILL.width,
              height: PILL.height,
              borderRadius: shape.radius.pill,
              backgroundColor: colors.surface2,
              opacity: onVenue ? 0 : 1,
              transform: [{ translateX: x }],
            }}
          />
        ) : null}
        {routes.map((route) => {
          const descriptor = descriptors[route.key];
          if (!descriptor) return null;
          const { options } = descriptor;
          const focused = focusedKey === route.key;
          const label = options.title ?? route.name;
          const badge = options.tabBarBadge;
          const isVenue = route.name === raised;
          const color = focused ? colors.text : colors.muted;
          const routeGlyph = ROUTE_GLYPH[route.name];

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };

          let glyph: ReactNode;
          if (isVenue) {
            glyph = (
              <View
                className="items-center justify-center"
                style={{
                  width: VENUE_DISC,
                  height: VENUE_DISC,
                  borderRadius: shape.radius.pill,
                  backgroundColor: focused ? colors.buzz : colors.surface2,
                  borderWidth: shape.stroke.venueRing,
                  borderColor: focused ? colors.border : 'transparent',
                }}
              >
                {focused ? (
                  <Snail variant="small" height={VENUE_DISC * 0.45} />
                ) : (
                  <SnailLineIcon size={ICON.lg} color={colors.text} />
                )}
              </View>
            );
          } else {
            // As high as the Mekan disc, so every label sits on the same line.
            glyph = (
              <View style={{ height: VENUE_DISC, justifyContent: 'center' }}>
                {routeGlyph ? (
                  <TabIcon name={routeGlyph} active={focused} color={color} />
                ) : (
                  options.tabBarIcon?.({ focused, color, size: ICON.lg })
                )}
                {badge !== undefined ? (
                  <View
                    className="absolute items-center justify-center"
                    style={{
                      top: SPACING[1],
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
            );
          }

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              testID={options.tabBarButtonTestID}
              accessibilityLabel={
                options.tabBarAccessibilityLabel ?? (badge ? `${label}, ${badge}` : label)
              }
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={{
                flex: 1,
                height: TAB_BAR_HEIGHT,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0,
              }}
            >
              {glyph}
              <Text variant="caption" tone={focused ? 'text' : 'muted'}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
