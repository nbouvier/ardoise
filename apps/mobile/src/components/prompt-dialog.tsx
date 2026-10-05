import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface PromptDialogProps {
  visible: boolean;
  title: string;
  /** What the field holds when the dialog opens. */
  initialValue: string;
  /** Names the field for screen readers. */
  fieldLabel: string;
  confirmLabel: string;
  maxLength?: number;
  /** Called with the trimmed value; never with an empty one. */
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/**
 * `ConfirmDialog` with a text field: the app's own way to ask for one short
 * value — a new name — where the OS has no prompt on Android at all.
 * Tapping outside, or the platform's back gesture, cancels.
 */
export function PromptDialog({
  visible,
  title,
  initialValue,
  fieldLabel,
  confirmLabel,
  maxLength,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const theme = useTheme();
  // Read once: the caller mounts the dialog for each thing it asks about
  // (keyed by it), so every opening starts from its own value.
  const [value, setValue] = useState(initialValue);

  const trimmed = value.trim();
  const submit = () => {
    if (trimmed.length > 0) {
      onConfirm(trimmed);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <Pressable
        accessibilityLabel="Dismiss"
        style={[styles.scrim, { backgroundColor: theme.scrim }]}
        onPress={onCancel}>
        <View accessibilityViewIsModal style={styles.frame}>
          <Pressable onPress={() => undefined}>
            <Card style={styles.dialog}>
              <ThemedText type="sectionTitle">{title}</ThemedText>
              <TextField
                accessibilityLabel={fieldLabel}
                value={value}
                onChangeText={setValue}
                onSubmitEditing={submit}
                maxLength={maxLength}
                autoFocus
              />
              <View style={styles.actions}>
                <Button label="Cancel" variant="ghost" onPress={onCancel} />
                <Button label={confirmLabel} disabled={trimmed.length === 0} onPress={submit} />
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
