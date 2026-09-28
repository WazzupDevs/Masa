import { ActivityIndicator, Pressable, Text } from 'react-native';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  // For end-to-end tests where the same label appears more than once (e2e/maestro).
  testID?: string;
};

const containerClass = {
  primary: 'bg-black',
  secondary: 'border border-neutral-300 bg-white',
  danger: 'bg-red-600',
} as const;

const labelClass = {
  primary: 'text-white',
  secondary: 'text-black',
  danger: 'text-white',
} as const;

export function Button({ label, onPress, disabled, loading, variant = 'primary', testID }: Props) {
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      className={`h-12 items-center justify-center rounded-xl ${containerClass[variant]} ${inactive ? 'opacity-40' : ''}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? 'black' : 'white'} />
      ) : (
        <Text className={`text-base font-semibold ${labelClass[variant]}`}>{label}</Text>
      )}
    </Pressable>
  );
}
