import { forwardRef } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextFieldProps = TextInputProps & {
  /** Grows to a paragraph box — a comment, not a name. */
  multiline?: boolean;
};

/**
 * Every text input in the app: a filled, pill-cornered field on
 * `backgroundElement`, never a bare underline. One component, so a field looks
 * the same whether it holds a name, a code or a comment.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { style, multiline, ...rest },
  ref,
) {
  const theme = useTheme();

  return (
    <TextInput
      ref={ref}
      multiline={multiline}
      placeholderTextColor={theme.textSecondary}
      style={[
        styles.field,
        multiline && styles.multiline,
        { color: theme.text, backgroundColor: theme.backgroundElement },
        style,
      ]}
      {...rest}
    />
  );
});

const styles = StyleSheet.create({
  field: {
    height: 52,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  multiline: {
    height: undefined,
    minHeight: 88,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    textAlignVertical: 'top',
  },
});
