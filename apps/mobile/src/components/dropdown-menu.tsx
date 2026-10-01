import { useId, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Card } from '@/components/card';
import { DropdownScrimAlpha, Spacing } from '@/constants/theme';
import { useIsDark, useTheme } from '@/hooks/use-theme';

export interface DropdownMenuProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The light violet wash behind a `DropdownMenu`, bled to the full screen
 * (status bar and home-indicator strips included — a `SafeAreaView` only
 * positions the menu itself, never the wash behind it). A vertical gradient
 * rather than a flat fill, echoing `HeroWash`'s own soft-light language:
 * lighter at the very top and bottom, peaking around the card itself, so the
 * screen still reads as dimmed everywhere but the eye settles on the menu.
 */
function DropdownScrim() {
  const theme = useTheme();
  const dark = useIsDark();
  const uid = useId();
  const peak = dark ? DropdownScrimAlpha.dark : DropdownScrimAlpha.light;

  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      viewBox="0 0 100 100"
      preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={`${uid}-scrim`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={theme.primary} stopOpacity={peak * 0.55} />
          <Stop offset="0.2" stopColor={theme.primary} stopOpacity={peak} />
          <Stop offset="0.6" stopColor={theme.primary} stopOpacity={peak} />
          <Stop offset="1" stopColor={theme.primary} stopOpacity={peak * 0.55} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${uid}-scrim)`} />
    </Svg>
  );
}

/**
 * The popup every dropdown list in the app opens into — a group's own "⋮"
 * menu, the category picker, a member field's options. Anchored a fifth of
 * the way down the screen rather than vertically centred, so it reads as
 * attached to the field or icon that opened it instead of a dialog floating
 * in the middle; `ConfirmDialog` is the one deliberate exception, since a
 * yes/no question is a dialog, not a list. `DropdownScrim` washes the *entire*
 * screen behind it — not just the area a `SafeAreaView` would leave after its
 * own insets — so it reads as "stepped back" rather than untouched, right up
 * to the very edges. The card's own border is drawn a shade heavier than a
 * plain `Card`'s hairline so it still stands out against that lighter wash.
 * Tapping outside, or the platform's back gesture, closes it.
 */
export function DropdownMenu({ visible, onClose, children }: DropdownMenuProps) {
  const theme = useTheme();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <DropdownScrim />
        <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
          <View style={styles.overlay} pointerEvents="box-none">
            <Card style={{ ...styles.menu, borderColor: theme.border }}>{children}</Card>
          </View>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Full-bleed: the dismiss target and the scrim both need the actual screen
  // bounds, not a `SafeAreaView`-inset rectangle.
  scrim: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    // A fifth of the screen's own height, not a fixed offset — stays
    // proportional across phone sizes.
    paddingTop: '20%',
  },
  menu: {
    width: '100%',
    maxWidth: 360,
    padding: Spacing.two,
    gap: Spacing.one,
    borderWidth: 1.5,
  },
});
