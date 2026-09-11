import { TextInput } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { DatePickerFieldProps } from './date-picker-props';

export type { DatePickerFieldProps } from './date-picker-props';

/**
 * `@expo/ui`'s host views don't exist on web — a plain `YYYY-MM-DD` text
 * field there instead, same as every native target got before this picker.
 */
export function DatePickerField({ value, onChange }: DatePickerFieldProps) {
  const theme = useTheme();

  return (
    <TextInput
      accessibilityLabel="Date"
      placeholder="YYYY-MM-DD"
      placeholderTextColor={theme.textSecondary}
      value={value}
      onChangeText={onChange}
      maxLength={10}
      style={{
        height: 52,
        borderRadius: Spacing.three,
        paddingHorizontal: Spacing.three,
        fontSize: 16,
        color: theme.text,
        backgroundColor: theme.backgroundElement,
      }}
    />
  );
}
