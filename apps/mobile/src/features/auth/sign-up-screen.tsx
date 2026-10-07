import {
  accountNameSchema,
  emailAddressSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type SignupRequest,
} from '@ardoise/shared';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { errorFields, logger } from '@/lib/logger';

import { authErrorMessage } from './auth-errors';
import { AuthPage } from './auth-page';
import { EmailField } from './email-field';
import { PasswordField } from './password-field';
import { useAuth } from './use-auth';

export interface SignUpScreenProps {
  /** What was typed before, when coming back to change the address. */
  initial: Partial<SignupRequest>;
  onBack: () => void;
  /** The code is on its way (or the address already has an account: the e-mail says so). */
  onCodeSent: (request: SignupRequest) => void;
}

/** Why the form cannot be sent yet, before asking the server anything. */
function problemWith(form: SignupRequest): string | null {
  if (!accountNameSchema.safeParse(form.name).success) {
    return 'Enter your name, as your groups will see it.';
  }
  if (!emailAddressSchema.safeParse(form.email).success) {
    return 'Enter a valid e-mail address.';
  }
  if (form.password.length < PASSWORD_MIN_LENGTH) {
    return `Choose a password of at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (form.password.length > PASSWORD_MAX_LENGTH) {
    return `Choose a password of at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}

/** Create an account: name, e-mail, password, then a code (`docs/specs/password-sign-in.md`). */
export function SignUpScreen({ initial, onBack, onCodeSent }: SignUpScreenProps) {
  const { requestSignup } = useAuth();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [name, setName] = useState(initial.name ?? '');
  const [email, setEmail] = useState(initial.email ?? '');
  const [password, setPassword] = useState(initial.password ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const form = { name, email, password };
    const problem = problemWith(form);
    if (problem) {
      setError(problem);
      return;
    }
    const request = {
      ...form,
      name: accountNameSchema.parse(name),
      email: emailAddressSchema.parse(email),
    };
    setError(null);
    setBusy(true);
    try {
      await requestSignup(request);
      onCodeSent(request);
    } catch (caught) {
      logger.warn('auth.sign_up.failed', errorFields(caught));
      setError(authErrorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <AuthPage
      title="Create an account"
      subtitle="We’ll send a code to your e-mail address to confirm it."
      onBack={onBack}>
      <View style={styles.form}>
        <TextField
          placeholder="Name"
          accessibilityLabel="Name"
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
          value={name}
          onChangeText={setName}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
        <EmailField
          ref={emailRef}
          value={email}
          onChangeText={setEmail}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <View style={styles.field}>
          <PasswordField
            ref={passwordRef}
            purpose="new"
            placeholder="Password"
            accessibilityLabel="Password"
            value={password}
            onChangeText={setPassword}
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
          <ThemedText type="small" themeColor="textSecondary">
            At least {PASSWORD_MIN_LENGTH} characters.
          </ThemedText>
        </View>
        {error ? (
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
            {error}
          </ThemedText>
        ) : null}
        <Button label="Continue" onPress={() => void submit()} busy={busy} />
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
