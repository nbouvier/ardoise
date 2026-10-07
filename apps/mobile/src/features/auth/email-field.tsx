import { forwardRef } from 'react';
import type { TextInput } from 'react-native';

import { TextField, type TextFieldProps } from '@/components/text-field';

/**
 * An e-mail address input: the e-mail keyboard, no correction or capitals,
 * and the hints that let password managers pair it with the password.
 */
export const EmailField = forwardRef<TextInput, TextFieldProps>(function EmailField(props, ref) {
  return (
    <TextField
      ref={ref}
      placeholder="E-mail"
      accessibilityLabel="E-mail"
      keyboardType="email-address"
      inputMode="email"
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="email"
      textContentType="username"
      {...props}
    />
  );
});
