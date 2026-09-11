import { useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface AmountInputProps {
  /**
   * Starting value, in cents. The field manages its own text after that —
   * pass a different `key` from the parent to force a fresh value instead of
   * fighting the user mid-edit (see `centsToText`/`parseAmount`).
   */
  defaultValueCents?: number;
  onChangeCents: (cents: number | null) => void;
  testID?: string;
  accessibilityLabel?: string;
  style?: TextInputProps['style'];
}

/** `4200` cents ↔ the text `"42.00"` a person actually types. */
export function centsToText(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Accepts a comma or a dot as the decimal separator. `null` means "not a
 * valid amount yet" (empty, mid-typing a lone separator, negative) — the
 * caller decides what that means for validation, this never throws.
 */
export function parseAmount(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '' || normalized === '.') {
    return null;
  }
  if (!/^\d*\.?\d*$/.test(normalized)) {
    return null;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.round(value * 100);
}

/** A money field: free-form text in, integer cents out. */
export function AmountInput({
  defaultValueCents = 0,
  onChangeCents,
  testID,
  accessibilityLabel = 'Amount',
  style,
}: AmountInputProps) {
  const theme = useTheme();
  const [text, setText] = useState(() => centsToText(defaultValueCents));

  function handleChange(next: string) {
    setText(next);
    onChangeCents(parseAmount(next));
  }

  return (
    <TextInput
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      keyboardType="decimal-pad"
      value={text}
      onChangeText={handleChange}
      placeholder="0.00"
      placeholderTextColor={theme.textSecondary}
      style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }, style]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    height: 52,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
});
