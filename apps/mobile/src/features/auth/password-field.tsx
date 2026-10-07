import { forwardRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { TextAction } from '@/components/text-action';
import { TextField, type TextFieldProps } from '@/components/text-field';
import { Spacing } from '@/constants/theme';

export interface PasswordFieldProps extends Omit<TextFieldProps, 'secureTextEntry'> {
  /** `new` when the person chooses a password, so password managers offer to make one. */
  purpose: 'current' | 'new';
}

/**
 * A password input with a Show / Hide toggle, carrying the hints password
 * managers rely on to fill or save it.
 */
export const PasswordField = forwardRef<TextInput, PasswordFieldProps>(function PasswordField(
  { purpose, style, ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrapper}>
      <TextField
        ref={ref}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={purpose === 'new' ? 'new-password' : 'current-password'}
        textContentType={purpose === 'new' ? 'newPassword' : 'password'}
        style={[styles.field, style]}
        {...rest}
      />
      <View style={styles.toggle}>
        <TextAction
          label={visible ? 'Hide' : 'Show'}
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          onPress={() => setVisible((shown) => !shown)}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    justifyContent: 'center',
  },
  field: {
    paddingRight: 72,
  },
  toggle: {
    position: 'absolute',
    right: Spacing.four,
  },
});
