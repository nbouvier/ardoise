import { TextField } from '@/components/text-field';

import type { DatePickerFieldProps } from './date-picker-props';

export type { DatePickerFieldProps } from './date-picker-props';

/**
 * `@expo/ui`'s host views don't exist on web — a plain `YYYY-MM-DD` text
 * field there instead, same as every native target got before this picker.
 */
export function DatePickerField({ value, onChange }: DatePickerFieldProps) {
  return (
    <TextField
      accessibilityLabel="Date"
      placeholder="YYYY-MM-DD"
      value={value}
      onChangeText={onChange}
      maxLength={10}
    />
  );
}
