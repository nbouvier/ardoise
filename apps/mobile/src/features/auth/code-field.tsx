import { forwardRef } from 'react';
import { StyleSheet, type TextInput } from 'react-native';

import { TextField, type TextFieldProps } from '@/components/text-field';

export type CodeFieldProps = Omit<TextFieldProps, 'onChangeText'> & {
  value: string;
  onChangeText: (code: string) => void;
};

/**
 * The 6-digit code e-mailed to prove an address: the digit keyboard, and the
 * one-time-code hint that lets the OS offer the code from the e-mail.
 */
export const CodeField = forwardRef<TextInput, CodeFieldProps>(function CodeField(
  { value, onChangeText, style, ...rest },
  ref,
) {
  return (
    <TextField
      ref={ref}
      placeholder="6-digit code"
      accessibilityLabel="Code"
      keyboardType="number-pad"
      inputMode="numeric"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      maxLength={6}
      value={value}
      // Pasted or autofilled codes may carry spaces.
      onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, 6))}
      // Spaced digits, but not a spaced-out placeholder.
      style={[styles.code, value ? styles.digits : null, style]}
      {...rest}
    />
  );
});

const styles = StyleSheet.create({
  code: {
    fontSize: 20,
    textAlign: 'center',
  },
  digits: {
    letterSpacing: 6,
  },
});
