import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmSheet } from '@/components/ConfirmSheet';
import { Text } from '@/components/Text';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { withAlpha } from '@/theme/contrast';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

const SCRIM_OPACITY = 0.45;
// The chat panel covers most of the screen; the game stays visible above it.
const PANEL_HEIGHT = '78%';
const BADGE = SPACING[5];

type Props = {
  // The game's name over the stage ("Sesli Tabu").
  title: string;
  children: ReactNode;
  unread: number;
  chatOpen: boolean;
  onChat: (open: boolean) => void;
  // The room chat: the room's top bar, its messages and the message bar.
  chat: ReactNode;
  onEndGame: () => void;
  ending: boolean;
  endError: unknown;
  // One table: the other table sees nothing, the confirmation says so.
  solo: boolean;
  // Over everything (the "Süre bitti" overlay).
  overlay?: ReactNode;
};

// The running game, full screen (canvas: Aşama 6 · Oyunlar → Tam ekran oyun): no tab bar and no
// chat stream. The chat folds into a button with the unread count; it opens as a panel from the
// bottom. The keyboard only lifts the panel, so the game's buttons never move. "×" ends the game
// after a confirmation.
export function GameStage({
  title,
  children,
  unread,
  chatOpen,
  onChat,
  chat,
  onEndGame,
  ending,
  endError,
  solo,
  overlay,
}: Props) {
  const { colors, shape } = useTheme();
  const [confirm, setConfirm] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View
        className="flex-row items-center gap-2.5"
        style={{
          paddingHorizontal: shape.screenPadding - SPACING[1],
          paddingVertical: SPACING[1.5],
        }}
      >
        <RoundButton
          testID="end-game"
          label={tr.games.endGame}
          icon="close"
          onPress={() => setConfirm(true)}
        />
        <Text variant="heading" accessibilityRole="header" numberOfLines={1} className="flex-1">
          {title}
        </Text>
        <View>
          <RoundButton
            testID="game-chat"
            label={tr.games.chatButton(unread)}
            icon="chatbubble-ellipses-outline"
            onPress={() => onChat(true)}
          />
          {unread > 0 ? (
            <View
              pointerEvents="none"
              className="absolute items-center justify-center"
              style={{
                top: -SPACING[0.5],
                right: -SPACING[0.5],
                minWidth: BADGE,
                height: BADGE,
                paddingHorizontal: SPACING[1],
                borderRadius: shape.radius.pill,
                backgroundColor: colors.danger,
              }}
            >
              <Text variant="caption" tone="onDanger">
                {unread > 99 ? '99+' : String(unread)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView
        testID="game-stage"
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: shape.screenPadding - SPACING[1],
          paddingTop: SPACING[2],
          paddingBottom: SPACING[6],
          gap: SPACING[3],
        }}
        keyboardShouldPersistTaps="handled"
      >
        {endError ? (
          <Text variant="fine" tone="danger">
            {errorMessage(endError)}
          </Text>
        ) : null}
        {children}
      </ScrollView>

      {overlay}

      {chatOpen ? (
        <View className="absolute inset-0">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr.common.close}
            onPress={() => onChat(false)}
            className="absolute inset-0"
            style={{ backgroundColor: withAlpha(colors.scrim, SCRIM_OPACITY) }}
          />
          <KeyboardAvoidingView
            behavior="padding"
            className="flex-1 justify-end"
            pointerEvents="box-none"
          >
            <SafeAreaView
              edges={['bottom']}
              testID="game-chat-panel"
              accessibilityViewIsModal
              style={{
                height: PANEL_HEIGHT,
                backgroundColor: colors.canvas,
                borderTopLeftRadius: shape.radius.lg,
                borderTopRightRadius: shape.radius.lg,
                overflow: 'hidden',
              }}
            >
              {chat}
            </SafeAreaView>
          </KeyboardAvoidingView>
        </View>
      ) : null}

      <ConfirmSheet
        visible={confirm}
        testID="end-game-confirm"
        title={tr.games.endGameConfirmTitle}
        body={solo ? tr.games.endGameConfirmSolo : tr.games.endGameConfirmBody}
        confirmLabel={tr.games.endGameConfirm}
        cancelLabel={tr.games.keepPlaying}
        danger
        pending={ending}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          onEndGame();
        }}
      />
    </SafeAreaView>
  );
}

function RoundButton({
  testID,
  label,
  icon,
  onPress,
}: {
  testID: string;
  label: string;
  icon: 'close' | 'chatbubble-ellipses-outline';
  onPress: () => void;
}) {
  const { colors, shape } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        justifyContent: 'center',
        width: TOUCH.min,
        height: TOUCH.min,
        borderRadius: shape.radius.pill,
        backgroundColor: pressed ? colors.raised : colors.surface2,
      })}
    >
      <Ionicons name={icon} size={ICON.md} color={colors.text} />
    </Pressable>
  );
}
