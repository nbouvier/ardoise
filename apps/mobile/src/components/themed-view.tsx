import { View, type ViewProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedViewProps = ViewProps & {
  /**
   * The surface this view paints. `transparent` is for a layout wrapper that
   * sits on something already painted — inside a `Card`, above all, where the
   * canvas colour would undo the card.
   */
  type?: ThemeColor | 'transparent';
};

export function ThemedView({ style, type, ...otherProps }: ThemedViewProps) {
  const theme = useTheme();
  const backgroundColor = type === 'transparent' ? 'transparent' : theme[type ?? 'background'];

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
