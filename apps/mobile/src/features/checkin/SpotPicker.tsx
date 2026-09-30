import { View } from 'react-native';

import { Choice } from '@/components/Choice';

import type { VenueSpot } from './spots';

type Props = {
  spots: readonly VenueSpot[];
  selectedId: string | null;
  onSelect: (spot: VenueSpot) => void;
};

// "Neredesin?": the venue's spots as a single choice. Shared by check-in and the spot change.
export function SpotPicker({ spots, selectedId, onSelect }: Props) {
  return (
    <View accessibilityRole="radiogroup" className="gap-2">
      {spots.map((spot) => (
        <Choice
          key={spot.id}
          testID={`spot-${spot.ref}`}
          label={spot.name}
          selected={selectedId === spot.id}
          onPress={() => onSelect(spot)}
        />
      ))}
    </View>
  );
}
