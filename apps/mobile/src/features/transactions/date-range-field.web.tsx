import { TextField } from '@/components/text-field';

import type { DateRangeFieldProps } from './date-picker-props';

export type { DateRangeFieldProps } from './date-picker-props';

/**
 * `@expo/ui`'s host views don't exist on web — a plain, nullable
 * `YYYY-MM-DD` text field there instead, the same fallback
 * `DatePickerField`'s own web variant already uses. An empty field is "no
 * bound", same as the native `null`.
 */
export function DateRangeField({ label, value, onChange }: DateRangeFieldProps) {
  return (
    <TextField
      accessibilityLabel={label}
      placeholder="Any"
      value={value ?? ''}
      onChangeText={(text) => onChange(text.length === 0 ? null : text)}
      maxLength={10}
    />
  );
}
