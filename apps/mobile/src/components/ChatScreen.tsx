import { type ReactNode, useRef } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { sameDay } from '@shared/chatRuns.ts';

import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING } from '@/theme/tokens';

import { useTabBarSpace } from './TabBar';
import { Text } from './Text';

type Props = {
  top: ReactNode;
  children: ReactNode;
  // The message bar, fixed at the bottom.
  composer: ReactNode;
  // Keep the newest message in view (DMs, the venue chat). The room starts at its top: the game.
  stickToEnd?: boolean;
  testID?: string;
};

// A chat app's screen (canvas: Aşama 4 · Yenileme): the top bar, the scrolling stream, the message
// bar at the bottom above the keyboard.
export function ChatScreen({ top, children, composer, stickToEnd, testID }: Props) {
  const { colors, shape } = useTheme();
  const scroll = useRef<ScrollView>(null);
  // Under the tabs (a DM) the floating tab bar covers the bottom: the message bar sits above it.
  const barSpace = useTabBarSpace();
  return (
    <SafeAreaView
      edges={barSpace ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']}
      style={{ flex: 1, backgroundColor: colors.canvas }}
    >
      {top}
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <ScrollView
          ref={scroll}
          testID={testID}
          className="flex-1"
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: shape.screenPadding - SPACING[1],
            paddingTop: SPACING[4],
            paddingBottom: SPACING[4],
            gap: SPACING[2],
          }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (stickToEnd) scroll.current?.scrollToEnd({ animated: false });
          }}
        >
          {children}
        </ScrollView>
        <View style={{ paddingBottom: barSpace }}>{composer}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// "Bugün" or "3 Ekim" over a day's first message.
export function DayLine({ label }: { label: string }) {
  const { colors, shape } = useTheme();
  return (
    <View
      className="my-1 self-center"
      style={{
        backgroundColor: colors.surface2,
        borderRadius: shape.radius.pill,
        paddingHorizontal: SPACING[2.5],
        paddingVertical: SPACING[0.5],
      }}
    >
      <Text variant="caption" tone="text">
        {label}
      </Text>
    </View>
  );
}

export function dayLabel(day: Date, now = new Date()): string {
  return sameDay(day, now) ? tr.chat.today : tr.chat.day(day.toISOString());
}
