import { Fragment, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface AddMenuOption {
  icon: IconName;
  label: string;
  onPress: () => void;
}

export interface AddMenuButtonProps {
  /** The full-width button's own label, e.g. "New group". */
  label: string;
  options: AddMenuOption[];
}

/** One row of the menu sheet: a small brand-washed glyph and a label. */
function MenuRow({ icon, label, onPress }: AddMenuOption) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}>
      <View style={[styles.menuIcon, { backgroundColor: theme.primarySoft }]}>
        <Icon name={icon} size={18} color={theme.onPrimarySoft} />
      </View>
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

/**
 * A screen's single, full-width footer action. Tapping it opens a small
 * bottom sheet offering the couple of related choices behind it (e.g.
 * create or join) as icon + label rows — the sheet sits exactly where the
 * button was, so there is no separate anchor to get wrong. See "Rules of
 * thumb" in docs/DESIGN.md.
 */
export function AddMenuButton({ label, options }: AddMenuButtonProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button label={label} onPress={() => setOpen(true)} />

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
                    icon={option.icon}
                    label={option.label}
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
  safeArea: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  menu: {
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
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuDivider: {
    height: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
