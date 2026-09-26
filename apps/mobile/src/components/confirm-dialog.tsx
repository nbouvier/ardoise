import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** Draws the confirming button as the red destructive one. */
  destructive?: boolean;
  /** A notice rather than a question: no Cancel, just the one button. */
  confirmOnly?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The app's own "are you sure" — a card over a dimmed screen, in the same
 * language as everything else, where the OS `Alert` would be a stock grey box.
 * Tapping outside, or the platform's back gesture, cancels.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  destructive = false,
  confirmOnly = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const theme = useTheme();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <Pressable
        accessibilityLabel="Dismiss"
        style={[styles.scrim, { backgroundColor: theme.scrim }]}
        onPress={onCancel}>
        {/* A plain View: taps on the card itself must not fall through to the scrim. */}
        <View accessibilityViewIsModal style={styles.frame}>
          <Pressable onPress={() => undefined}>
            <Card style={styles.dialog}>
              <ThemedText type="sectionTitle">{title}</ThemedText>
              <ThemedText themeColor="textSecondary">{message}</ThemedText>
              <View style={styles.actions}>
                {confirmOnly ? null : <Button label="Cancel" variant="ghost" onPress={onCancel} />}
                <Button
                  label={confirmLabel}
                  variant={destructive ? 'danger' : 'primary'}
                  onPress={onConfirm}
                />
              </View>
            </Card>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  frame: {
    width: '100%',
    maxWidth: 360,
  },
  dialog: {
    gap: Spacing.three,
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
});
