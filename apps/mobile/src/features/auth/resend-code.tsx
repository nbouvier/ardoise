import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TextAction } from '@/components/text-action';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { errorFields, logger } from '@/lib/logger';

import { authErrorMessage } from './auth-errors';

export interface ResendCodeProps {
  /** Ask for a new code; the previous one stops working. */
  onResend: () => Promise<void>;
}

/** "Resend code", and what came of it. */
export function ResendCode({ onResend }: ResendCodeProps) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(null);

  async function resend() {
    setBusy(true);
    setOutcome(null);
    try {
      await onResend();
      setOutcome({ ok: true, message: 'A new code is on its way.' });
    } catch (caught) {
      logger.warn('auth.code.resend.failed', errorFields(caught));
      setOutcome({ ok: false, message: authErrorMessage(caught) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        No e-mail? Check your spam folder, or
      </ThemedText>
      <TextAction label="Resend code" onPress={() => void resend()} disabled={busy} />
      {outcome ? (
        <ThemedText
          type="small"
          themeColor={outcome.ok ? 'textSecondary' : 'danger'}
          accessibilityRole={outcome.ok ? undefined : 'alert'}
          style={styles.outcome}>
          {outcome.message}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.two,
    rowGap: Spacing.one,
  },
  outcome: {
    width: '100%',
  },
});
