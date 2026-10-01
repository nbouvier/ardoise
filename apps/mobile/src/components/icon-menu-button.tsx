import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DropdownMenu } from '@/components/dropdown-menu';
import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface IconMenuOption {
  icon: IconName;
  label: string;
  /** Renders the row in the danger colour — a destructive action. */
  destructive?: boolean;
  onPress: () => void;
}

export interface IconMenuButtonProps {
  accessibilityLabel: string;
  options: IconMenuOption[];
  disabled?: boolean;
}

function MenuRow({ icon, label, destructive = false, onPress }: IconMenuOption) {
  const theme = useTheme();
  const color = destructive ? theme.danger : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.primarySoft }]}>
      <Icon name={icon} size={18} color={color} />
      <ThemedText type="smallBold" themeColor={destructive ? 'danger' : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/**
 * One item's own "⋮" action menu: a sheet of icon + label rows, anchored to a
 * small icon, for actions that belong to a single row rather than the screen.
 */
export function IconMenuButton({
  accessibilityLabel,
  options,
  disabled = false,
}: IconMenuButtonProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        hitSlop={8}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          pressed && { backgroundColor: theme.primarySoft },
        ]}>
        <Icon name="more" size={18} color={theme.textSecondary} filled />
      </Pressable>

      <DropdownMenu visible={open} onClose={() => setOpen(false)}>
        {options.map((option, index) => (
          <Fragment key={option.label}>
            {index > 0 ? (
              <View style={[styles.menuDivider, { backgroundColor: theme.border }]} />
            ) : null}
            <MenuRow
              {...option}
              onPress={() => {
                setOpen(false);
                option.onPress();
              }}
            />
          </Fragment>
        ))}
      </DropdownMenu>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.medium,
  },
  menuDivider: {
    height: 1,
  },
});
