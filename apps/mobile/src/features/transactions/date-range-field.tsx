import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { DatePickerField } from './date-picker-field';
import {
  formatOccurredOnShort,
  parseOccurredOn,
  toOccurredOn,
  type DateRangeFieldProps,
} from './date-picker-props';

export type { DateRangeFieldProps } from './date-picker-props';

/**
 * An optional date bound — "Any" until set, a calendar icon rather than
 * `ParticipantsField`'s chevron since tapping it opens a single date rather
 * than a list. Android gets full control over its own pill (a short-format
 * label, truncated with an ellipsis rather than resized or wrapped, a
 * native dialog on tap) the same way `DatePickerField`'s own Android branch
 * does; iOS's inline `compact` widget owns its own label and can't take a
 * custom one, so it keeps the "Any" pill only until first tapped, then
 * falls back to the shared `DatePickerField` (`docs/specs/group-statistics.md`).
 */
export function DateRangeField({ label, value, onChange }: DateRangeFieldProps) {
  const theme = useTheme();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (Platform.OS === 'android') {
    const displayLabel = value === null ? 'Any' : formatOccurredOnShort(value);
    return (
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${displayLabel}`}
          onPress={() => setDialogOpen(true)}
          style={({ pressed }) => [
            styles.field,
            styles.picker,
            { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
          ]}>
          <ThemedText numberOfLines={1} style={styles.label}>
            {displayLabel}
          </ThemedText>
          <Icon name="calendar" size={16} color={theme.textSecondary} />
        </Pressable>
        {value !== null ? (
          <IconButton
            icon="close"
            accessibilityLabel={`Clear ${label.toLowerCase()}`}
            color={theme.textSecondary}
            onPress={() => onChange(null)}
          />
        ) : null}
        {dialogOpen ? (
          <DateTimePicker
            value={value === null ? new Date() : parseOccurredOn(value)}
            mode="date"
            presentation="dialog"
            onValueChange={(_event, selected) => {
              onChange(toOccurredOn(selected));
              setDialogOpen(false);
            }}
            onDismiss={() => setDialogOpen(false)}
          />
        ) : null}
      </View>
    );
  }

  if (value === null) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: Any`}
        onPress={() => onChange(toOccurredOn(new Date()))}
        style={({ pressed }) => [
          styles.field,
          styles.stretch,
          { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
        ]}>
        <ThemedText numberOfLines={1} style={styles.label}>
          Any
        </ThemedText>
        <Icon name="calendar" size={16} color={theme.textSecondary} />
      </Pressable>
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.picker}>
        <DatePickerField value={value} onChange={onChange} />
      </View>
      <IconButton
        icon="close"
        accessibilityLabel={`Clear ${label.toLowerCase()}`}
        color={theme.textSecondary}
        onPress={() => onChange(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: Spacing.one,
  },
  stretch: {
    alignSelf: 'stretch',
  },
  picker: {
    flex: 1,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    height: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  label: {
    flexShrink: 1,
  },
});
