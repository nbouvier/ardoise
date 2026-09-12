import { Fragment, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const BUTTON_SIZE = 52;

export interface AddMenuOption {
  icon: IconName;
  label: string;
  onPress: () => void;
}

export interface AddMenuButtonProps {
  accessibilityLabel: string;
  options: AddMenuOption[];
}

/** One row of the "+" action menu: a small brand-washed glyph and a label. */
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
 * The footer's single action: a round "+" that opens a small menu of related
 * choices stacked directly above it — the button sits at the menu's
 * bottom-right corner, not its top-right, so it never appears to float above
 * or apart from the button it belongs to. The overlay mirrors the footer's
 * own `SafeAreaView` + padding exactly (see the Groups/Friends screens) so
 * it lands on the real device inset, not just the approximate tab-bar
 * constant. See "Rules of thumb" in docs/DESIGN.md.
 */
export function AddMenuButton({ accessibilityLabel, options }: AddMenuButtonProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton icon="plus" accessibilityLabel={accessibilityLabel} onPress={() => setOpen(true)} />

      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.safeArea}>
          <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
            <View style={styles.menuWrap}>
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
            </View>
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
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three + BUTTON_SIZE + Spacing.two,
  },
  menuWrap: {
    width: 220,
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
