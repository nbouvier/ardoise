import { Pressable, Text } from 'react-native';

/**
 * Manual Jest mock for `@expo/ui`'s native SwiftUI/Compose date picker — Jest
 * cannot render a real host view. Exposes just enough to test the wiring
 * around it: pressing it reports a fixed, well-known date, regardless of
 * platform or presentation. Real calendar interaction is a device concern
 * (`docs/guidelines/TESTING.md`: visual/human validation), not a unit-test one.
 */
export const MOCK_SELECTED_DATE = new Date('2027-01-15T00:00:00');

export interface DateTimePickerProps {
  value: Date;
  onValueChange?: (event: { nativeEvent: { timestamp: number; utcOffset: number } }, date: Date) => void;
  onChange?: (
    event: { type: 'set' | 'dismissed'; nativeEvent: { timestamp: number; utcOffset: number } },
    date?: Date,
  ) => void;
  testID?: string;
}

export function DateTimePicker({ value, onValueChange, onChange, testID }: DateTimePickerProps) {
  function select() {
    const nativeEvent = { timestamp: MOCK_SELECTED_DATE.getTime(), utcOffset: 0 };
    if (onValueChange) {
      onValueChange({ nativeEvent }, MOCK_SELECTED_DATE);
    } else {
      onChange?.({ type: 'set', nativeEvent }, MOCK_SELECTED_DATE);
    }
  }

  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel="date-picker-mock" onPress={select}>
      <Text>{value.toISOString()}</Text>
    </Pressable>
  );
}

export default DateTimePicker;
