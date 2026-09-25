import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { SPACING } from '@/theme/tokens';

type Props = {
  children: ReactNode;
  // Tab screens leave the bottom edge to the tab bar.
  edges?: readonly Edge[];
};

// A scrolling screen on the canvas with the direction's side padding.
export function Screen({ children, edges }: Props) {
  const { colors, shape } = useTheme();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: shape.screenPadding,
            paddingTop: SPACING[3],
            paddingBottom: SPACING[8],
          }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
