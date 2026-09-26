import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tr } from '@/i18n/tr';
import { withAlpha } from '@/theme/contrast';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING } from '@/theme/tokens';

import type { IconName } from './Button';
import { Quiet } from './Quiet';
import { Text } from './Text';

const SCRIM_OPACITY = 0.45;
const HANDLE = { width: 40, height: 5 } as const;
const ICON_DISC = 56;

type Props = {
  visible: boolean;
  // Without it the sheet can only be left through its own buttons (the join request).
  onClose?: () => void;
  title: string;
  icon?: IconName;
  // Centered text for a single decision (the join request); menus stay left-aligned.
  centered?: boolean;
  children: ReactNode;
};

// A bottom sheet over a scrim: menus, confirmations and the join request. Always a trust surface
// (`Quiet`): hairlines, no hard shadows, one clear action.
export function Sheet({ visible, onClose, title, icon, centered, children }: Props) {
  const { colors, shape } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose ?? (() => undefined)}
    >
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityRole={onClose ? 'button' : undefined}
          accessibilityLabel={onClose ? tr.common.close : undefined}
          disabled={!onClose}
          onPress={onClose}
          className="absolute inset-0"
          style={{ backgroundColor: withAlpha(colors.scrim, SCRIM_OPACITY) }}
        />
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: shape.radius.lg,
            borderTopRightRadius: shape.radius.lg,
            paddingTop: SPACING[2.5],
            paddingHorizontal: SPACING[6],
            paddingBottom: SPACING[6] + insets.bottom,
            maxHeight: '90%',
          }}
        >
          <View
            className="mb-2 self-center"
            style={{
              width: HANDLE.width,
              height: HANDLE.height,
              borderRadius: shape.radius.pill,
              backgroundColor: colors.divider,
            }}
          />
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            <Quiet value>
              <View className={`gap-3 ${centered ? 'items-center' : ''}`}>
                {icon ? (
                  <View
                    className="mt-2 items-center justify-center"
                    style={{
                      width: ICON_DISC,
                      height: ICON_DISC,
                      borderRadius: shape.radius.pill,
                      backgroundColor: colors.surface2,
                    }}
                  >
                    <Ionicons name={icon} size={ICON.lg} color={colors.text} />
                  </View>
                ) : null}
                <Text
                  variant="title"
                  align={centered ? 'center' : undefined}
                  accessibilityRole="header"
                >
                  {title}
                </Text>
              </View>
              <View className="mt-3 gap-3">{children}</View>
            </Quiet>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
