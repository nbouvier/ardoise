import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import {
  formatOccurredOnShort,
  parseOccurredOn,
  toOccurredOn,
  type DatePickerFieldProps,
} from './date-picker-props';

export type { DatePickerFieldProps } from './date-picker-props';

/**
 * A native date field, `YYYY-MM-DD` in and out. iOS gets an inline `compact`
 * `DatePicker` (SwiftUI) — a small tappable field with its own popover.
 * Android has no inline "compact field" style for the Material picker, so a
 * plain button opens the dialog variant and it unmounts on selection or
 * dismissal, per `@expo/ui`'s own contract for that presentation.
 *
 * No `@expo/ui` host views exist on web — see `date-picker-field.web.tsx`.
 */
export function DatePickerField({ value, onChange }: DatePickerFieldProps) {
  const theme = useTheme();
  const [dialogOpen, setDialogOpen] = useState(false);
  const date = parseOccurredOn(value);

  function handleSelected(selected: Date) {
    onChange(toOccurredOn(selected));
    setDialogOpen(false);
  }

  if (Platform.OS === 'android') {
    return (
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Date"
          onPress={() => setDialogOpen(true)}
          style={({ pressed }) => [
            styles.field,
            { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
          ]}>
          <ThemedText numberOfLines={1}>{formatOccurredOnShort(value)}</ThemedText>
        </Pressable>
        {dialogOpen ? (
          <DateTimePicker
            value={date}
            mode="date"
            presentation="dialog"
            onValueChange={(_event, selected) => handleSelected(selected)}
            onDismiss={() => setDialogOpen(false)}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.field, styles.iosField, { backgroundColor: theme.backgroundElement }]}>
      <DateTimePicker
        value={date}
        mode="date"
        display="compact"
        onValueChange={(_event, selected) => handleSelected(selected)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    height: 52,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
  iosField: {
    alignItems: 'flex-start',
  },
});
