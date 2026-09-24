import { Pressable, Text } from 'react-native';

type Props = { label: string; hint?: string; selected: boolean; onPress: () => void };

export function Choice({ label, hint, selected, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`rounded-xl border-2 px-4 py-3 ${selected ? 'border-black bg-neutral-100' : 'border-neutral-200'}`}
    >
      <Text className="text-base font-semibold text-black">{label}</Text>
      {hint ? <Text className="mt-1 text-sm text-neutral-500">{hint}</Text> : null}
    </Pressable>
  );
}
