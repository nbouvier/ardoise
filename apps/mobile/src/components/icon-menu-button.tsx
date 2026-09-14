import { Fragment, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
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
      style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}>
      <Icon name={icon} size={18} color={color} />
      <ThemedText type="smallBold" themeColor={destructive ? 'danger' : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/**
 * One item's own "⋮" action menu — the same bottom-sheet-of-rows language as
 * `AddMenuButton`, anchored to a small icon instead of a full-width footer
 * button, for actions that belong to a single row rather than the screen.
 */
export function IconMenuButton({ accessibilityLabel, options, disabled = false }: IconMenuButtonProps) {
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
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}>
        <Icon name="more" size={18} color={theme.textSecondary} filled />
      </Pressable>

      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.safeArea}>
          <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
            <Card style={styles.menu}>
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
            </Card>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  menu: {
    width: '100%',
    maxWidth: 360,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  menuDivider: {
    height: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
