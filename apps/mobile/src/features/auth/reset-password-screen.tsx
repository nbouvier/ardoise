import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@ardoise/shared';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { errorFields, logger } from '@/lib/logger';

import { authErrorMessage } from './auth-errors';
import { AuthPage } from './auth-page';
import { CodeField } from './code-field';
import { PasswordField } from './password-field';
import { ResendCode } from './resend-code';
import { useAuth } from './use-auth';

export interface ResetPasswordScreenProps {
  email: string;
  onBack: () => void;
}

/**
 * The reset code and the new password. Setting it signs in here and signs
 * every other device out (`docs/specs/password-sign-in.md`).
 */
export function ResetPasswordScreen({ email, onBack }: ResetPasswordScreenProps) {
  const { requestPasswordReset, confirmPasswordReset } = useAuth();
  const passwordRef = useRef<TextInput>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (code.length !== 6) {
      setError('Enter the 6-digit code from the e-mail.');
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      setError(`Choose a password of ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await confirmPasswordReset({ email, code, password });
    } catch (caught) {
      logger.warn('auth.password_reset.confirm.failed', errorFields(caught));
      setError(authErrorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <AuthPage
      title="Set a new password"
      subtitle={
        <>
          If an account uses <ThemedText type="smallBold">{email}</ThemedText>, we sent it a
          6-digit code. It is valid for 15 minutes.
        </>
      }
      onBack={onBack}>
      <View style={styles.form}>
        <CodeField
          value={code}
          onChangeText={setCode}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          autoFocus
        />
        <View style={styles.field}>
          <PasswordField
            ref={passwordRef}
            purpose="new"
            placeholder="New password"
            accessibilityLabel="New password"
            value={password}
            onChangeText={setPassword}
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
          <ThemedText type="small" themeColor="textSecondary">
            At least {PASSWORD_MIN_LENGTH} characters. Your other devices will be signed out.
          </ThemedText>
        </View>
        {error ? (
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
            {error}
          </ThemedText>
        ) : null}
        <Button label="Set password and sign in" onPress={() => void submit()} busy={busy} />
        <ResendCode onResend={() => requestPasswordReset(email)} />
      </View>
    </AuthPage>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three,
  },
  field: {
    gap: Spacing.one,
  },
});
