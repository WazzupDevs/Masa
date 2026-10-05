import { View } from 'react-native';

import { Button } from './Button';
import { Sheet } from './Sheet';
import { Text } from './Text';

type Props = {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  // A destructive action ("Bitir") in the danger colour.
  danger?: boolean;
  pending?: boolean;
  testID?: string;
};

// A yes/no question in a bottom sheet ("Oyunu bitirelim mi?"). The cancel button keeps things as
// they are; the confirm button is the one action. `testID` names the confirm button; cancel gets
// `${testID}-cancel`.
export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  danger,
  pending,
  testID,
}: Props) {
  return (
    <Sheet visible={visible} onClose={onCancel} title={title}>
      <Text variant="fine">{body}</Text>
      <View className="flex-row gap-2.5">
        <View className="flex-1">
          <Button
            variant="secondary"
            testID={testID ? `${testID}-cancel` : undefined}
            label={cancelLabel}
            onPress={onCancel}
          />
        </View>
        <View className="flex-1">
          <Button
            variant={danger ? 'danger' : 'primary'}
            testID={testID}
            label={confirmLabel}
            onPress={onConfirm}
            loading={pending}
          />
        </View>
      </View>
    </Sheet>
  );
}
