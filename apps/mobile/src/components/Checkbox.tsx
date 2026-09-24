import { Pressable, Text, View } from 'react-native';

type Props = { label: string; checked: boolean; onToggle: () => void };

export function Checkbox({ label, checked, onToggle }: Props) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      className="flex-row items-center gap-3 py-2"
    >
      <View
        className={`h-6 w-6 items-center justify-center rounded-md border-2 ${checked ? 'border-black bg-black' : 'border-neutral-400'}`}
      >
        {checked ? <View className="h-2.5 w-2.5 rounded-sm bg-white" /> : null}
      </View>
      <Text className="flex-1 text-base text-black">{label}</Text>
    </Pressable>
  );
}
