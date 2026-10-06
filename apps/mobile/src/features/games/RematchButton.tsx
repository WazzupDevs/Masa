import { Button } from '@/components/Button';
import { tr } from '@/i18n/tr';

// "Rövanş" on the game-over screen (canvas: Aşama 6 · Oyunlar → Oyun sonu): the same game proposed
// again; in a two-table room it starts when the other table accepts.
export function RematchButton({
  onPress,
  loading,
  disabled,
}: {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      testID="rematch"
      icon="refresh"
      label={tr.games.rematch}
      onPress={onPress}
      loading={loading}
      disabled={disabled}
    />
  );
}
