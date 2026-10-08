import { useFocusEffect } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { useReduceMotion } from '@/lib/useReduceMotion';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, type PaletteKey, SPACING, TAB_TONES, TOUCH, VENUE_TAB_TONE } from '@/theme/tokens';

import { FADE_IMAGE, type TabGlyph, TabIcon } from './Glyph';
import { Text } from './Text';

// The floating capsule (canvas: Aşama 1 · Son → Sekme çubuğu, option 1): 16 in from the screen
// edges, 8 above the safe area, fully rounded; an opaque surface with a soft shadow and no top
// line. Content scrolls behind it and fades into the canvas (one stretched, tinted gradient image:
// no native gradient module); over the Keşfet map there is no fade. The Mekan disc sits inside it.
// Aşama 8 · Saha: five icons of one family at one size; the selected tab's icon is solid and in its
// own colour, the others are line icons in one colour; the halo wraps only the icon, so a long
// label ("Aktiviteler") never spills out of it.
export const TAB_BAR_HEIGHT = TOUCH.large;
const INSET = SPACING[4];
const GAP = SPACING[2];
const VENUE_DISC = SPACING[10];
const PILL = { width: SPACING[12] + SPACING[1], height: SPACING[8] } as const;
const LABEL_HEIGHT = SPACING[4];
// The icon row is as high as the Mekan disc, so every label sits on the same line; the halo is
// centred on the icon.
const PILL_TOP = (TAB_BAR_HEIGHT - VENUE_DISC - LABEL_HEIGHT) / 2 + (VENUE_DISC - PILL.height) / 2;
const BADGE = 18;
const FADE_HEIGHT = 128;

// The tab icon and colour of each route; the Arkadaşlar tab uses the Mesajlar icon. Other routes
// fall back to their `tabBarIcon` option.
const ROUTE_GLYPH: Partial<Record<string, { glyph: TabGlyph; tone: PaletteKey }>> = {
  explore: { glyph: 'explore', tone: TAB_TONES.explore },
  activities: { glyph: 'activities', tone: TAB_TONES.activities },
  friends: { glyph: 'messages', tone: TAB_TONES.messages },
  messages: { glyph: 'messages', tone: TAB_TONES.messages },
  profile: { glyph: 'profile', tone: TAB_TONES.profile },
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
              top: PILL_TOP,
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
          const tabGlyph = ROUTE_GLYPH[route.name];
          const color = focused && tabGlyph ? colors[tabGlyph.tone] : colors.muted;

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
            // The raised Mekan disc: filled with its colour when selected.
            glyph = (
              <View
                className="items-center justify-center"
                style={{
                  width: VENUE_DISC,
                  height: VENUE_DISC,
                  borderRadius: shape.radius.pill,
                  backgroundColor: focused ? colors[VENUE_TAB_TONE.fill] : colors.surface2,
                  borderWidth: shape.stroke.venueRing,
                  borderColor: focused ? colors.border : 'transparent',
                }}
              >
                <TabIcon
                  name="venue"
                  active={focused}
                  color={focused ? colors[VENUE_TAB_TONE.icon] : colors.muted}
                />
              </View>
            );
          } else {
            // As high as the Mekan disc, so every label sits on the same line.
            glyph = (
              <View style={{ height: VENUE_DISC, justifyContent: 'center' }}>
                {tabGlyph ? (
                  <TabIcon name={tabGlyph.glyph} active={focused} color={color} />
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
              {/* One line; a long name ("Aktiviteler") shrinks a little on a narrow phone. */}
              <Text
                variant="caption"
                tone={focused ? 'text' : 'muted'}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
