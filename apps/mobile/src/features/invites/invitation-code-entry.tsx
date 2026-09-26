import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { getApiBaseUrl } from '@/lib/api/config';

import { parseInviteUrl, pendingInvite } from './pending-invite';

/**
 * The manual fallback for someone who installed the app (or opened this
 * screen) after receiving an invitation link rather than through it — a
 * friend invitation and a group invitation are typed and opened the same way,
 * since the code alone doesn't say which it is until the server answers.
 *
 * Shared between the Friends and Groups tabs so both entry points render
 * identically. Pasting the whole link works too: only its code is kept.
 */
export interface InvitationCodeEntryProps {
  /** Called after a code is handed off — lets a host sheet close itself. */
  onSubmitted?: () => void;
  /** The small heading above the field. */
  title?: string;
}

export function InvitationCodeEntry({
  onSubmitted,
  title = 'Got an invitation code?',
}: InvitationCodeEntryProps = {}) {
  const [code, setCode] = useState('');

  /** A pasted link is cut down to the code it carries; anything else is left as typed. */
  function handleChange(text: string) {
    setCode(parseInviteUrl(text.trim()) ?? text);
  }

  function handleUseCode() {
    pendingInvite.set(parseInviteUrl(code.trim()) ?? code);
    setCode('');
    onSubmitted?.();
  }

  return (
    <View style={styles.container}>
      <ThemedText type="overline" themeColor="textSecondary">
        {title}
      </ThemedText>
      <View style={styles.codeRow}>
        <TextField
          accessibilityLabel="Invitation code"
          placeholder={`${getApiBaseUrl()}/i/…`}
          autoCapitalize="none"
          autoCorrect={false}
          value={code}
          onChangeText={handleChange}
          onSubmitEditing={handleUseCode}
          style={styles.codeInput}
        />
        <Button
          label="Join"
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
