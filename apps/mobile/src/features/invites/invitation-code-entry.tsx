import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { pendingInvite } from './pending-invite';

/**
 * The manual fallback for someone who installed the app (or opened this
 * screen) after receiving an invitation link rather than through it — a
 * friend invitation and a group invitation are typed and opened the same way,
 * since the code alone doesn't say which it is until the server answers.
 *
 * Shared between the Friends and Groups tabs so both entry points render
 * identically.
 */
export function InvitationCodeEntry() {
  const theme = useTheme();
  const [code, setCode] = useState('');

  function handleUseCode() {
    pendingInvite.set(code);
    setCode('');
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        Got an invitation code?
      </ThemedText>
      <ThemedView style={styles.codeRow}>
        <TextInput
          accessibilityLabel="Invitation code"
          placeholder="Paste it here"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          value={code}
          onChangeText={setCode}
          onSubmitEditing={handleUseCode}
          style={[
            styles.codeInput,
            { color: theme.text, backgroundColor: theme.backgroundElement },
          ]}
        />
        <Button
          label="Open"
          variant="secondary"
          disabled={code.trim().length === 0}
          onPress={handleUseCode}
        />
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  codeInput: {
    flex: 1,
    height: 52,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
});
