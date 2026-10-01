import { useState } from 'react';
import { StyleSheet, View, type TextInputProps } from 'react-native';

import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

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
  const [text, setText] = useState(() => centsToText(defaultValueCents));

  function handleChange(next: string) {
    setText(next);
    onChangeCents(parseAmount(next));
  }

  /** Tapping a field still reading zero clears it, so typing a sum doesn't
   * first require deleting the "0.00" that was never a real value anyway. A
   * non-zero amount is a real edit in progress and is left alone. */
  function handleFocus() {
    if (parseAmount(text) === 0) {
      setText('');
    }
  }

  return (
    <View style={styles.wrapper}>
      <TextField
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        keyboardType="decimal-pad"
        value={text}
        onChangeText={handleChange}
        onFocus={handleFocus}
        placeholder="0.00"
        style={[styles.input, styles.fieldWithSuffix, style]}
      />
      {/* Decorative — the field's own accessibility label already says "amount". */}
      <View pointerEvents="none" style={styles.suffix}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.suffixText}>
          €
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  /** A figure, not prose: heavier than a name field, but not a headline. */
  input: {
    fontSize: 17,
    fontWeight: '700',
  },
  fieldWithSuffix: {
    paddingRight: Spacing.five,
  },
  suffix: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: Spacing.three,
    justifyContent: 'center',
  },
  suffixText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
