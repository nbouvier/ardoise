import { emailAddressSchema } from '@ardoise/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { errorFields, logger } from '@/lib/logger';

import { authErrorMessage } from './auth-errors';
import { AuthPage } from './auth-page';
import { EmailField } from './email-field';
import { useAuth } from './use-auth';

export interface ForgotPasswordScreenProps {
  email: string;
  onEmailChange: (email: string) => void;
  onBack: () => void;
  /** Answered: a code went to the address if it has an account. */
  onCodeSent: (email: string) => void;
}

/** Ask for a code to set a new password (`docs/specs/password-sign-in.md`). */
export function ForgotPasswordScreen({
  email,
  onEmailChange,
  onBack,
  onCodeSent,
}: ForgotPasswordScreenProps) {
  const { requestPasswordReset } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const parsed = emailAddressSchema.safeParse(email);
    if (!parsed.success) {
      setError('Enter a valid e-mail address.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await requestPasswordReset(parsed.data);
      onCodeSent(parsed.data);
    } catch (caught) {
      logger.warn('auth.password_reset.request.failed', errorFields(caught));
      setError(authErrorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <AuthPage
      title="Forgot your password?"
      subtitle="Enter the e-mail address of your account: we’ll send it a code to set a new password."
      onBack={onBack}>
      <View style={styles.form}>
        <EmailField
          value={email}
          onChangeText={onEmailChange}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          autoFocus
        />
        {error ? (
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
            {error}
          </ThemedText>
        ) : null}
        <Button label="Send me a code" onPress={() => void submit()} busy={busy} />
      </View>
    </AuthPage>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three,
  },
});
