import type { SignupRequest } from '@ardoise/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { TextAction } from '@/components/text-action';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { errorFields, logger } from '@/lib/logger';

import { authErrorMessage } from './auth-errors';
import { AuthPage } from './auth-page';
import { CodeField } from './code-field';
import { ResendCode } from './resend-code';
import { useAuth } from './use-auth';

export interface VerifySignUpScreenProps {
  request: SignupRequest;
  /** Back to the form, to change the address. */
  onBack: () => void;
}

/**
 * The code sent to the address: entering it creates the account and signs in.
 * The screen never says whether the address already had an account — the
 * e-mail does (`docs/specs/password-sign-in.md`).
 */
export function VerifySignUpScreen({ request, onBack }: VerifySignUpScreenProps) {
  const { requestSignup, verifySignup } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (code.length !== 6) {
      setError('Enter the 6-digit code from the e-mail.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // Signed in: the gate takes it from here, and this screen goes away.
      await verifySignup(request.email, code);
    } catch (caught) {
      logger.warn('auth.sign_up.verify.failed', errorFields(caught));
      setError(authErrorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <AuthPage
      title="Check your e-mail"
      subtitle={
        <>
          We sent a 6-digit code to <ThemedText type="smallBold">{request.email}</ThemedText>. It
          is valid for 15 minutes.
        </>
      }
      onBack={onBack}>
      <View style={styles.form}>
        <CodeField
          value={code}
          onChangeText={setCode}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          autoFocus
        />
        {error ? (
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
            {error}
          </ThemedText>
        ) : null}
        <Button label="Create my account" onPress={() => void submit()} busy={busy} />
        <ResendCode onResend={() => requestSignup(request)} />
        <TextAction label="Use another e-mail address" onPress={onBack} style={styles.start} />
      </View>
    </AuthPage>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three,
  },
  start: {
    alignSelf: 'flex-start',
  },
});
