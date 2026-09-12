import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

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
  const [code, setCode] = useState('');

  function handleUseCode() {
    pendingInvite.set(code);
    setCode('');
  }

  return (
    <View style={styles.container}>
      <ThemedText type="overline" themeColor="textSecondary">
        Got an invitation code?
      </ThemedText>
      <View style={styles.codeRow}>
        <TextField
          accessibilityLabel="Invitation code"
          placeholder="Paste it here"
          autoCapitalize="none"
          autoCorrect={false}
          value={code}
          onChangeText={setCode}
          onSubmitEditing={handleUseCode}
          style={styles.codeInput}
        />
        <Button
          label="Open"
          variant="secondary"
          disabled={code.trim().length === 0}
          onPress={handleUseCode}
        />
      </View>
    </View>
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
  },
});
