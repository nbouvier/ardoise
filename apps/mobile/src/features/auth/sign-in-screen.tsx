import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/button';
import { OrDivider } from '@/components/or-divider';
import { TextAction } from '@/components/text-action';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorFields, logger } from '@/lib/logger';

import { AuthPage } from './auth-page';
import { authErrorMessage } from './auth-errors';
import { EmailField } from './email-field';
import { GoogleSignInCancelled } from './google-module';
import { LEGAL_PAGES, openLegalPage, type LegalPage } from './legal-links';
import { PasswordField } from './password-field';
import { useAuth } from './use-auth';

export interface SignInScreenProps {
  /** The address typed so far, carried between the signed-out steps. */
  email: string;
  onEmailChange: (email: string) => void;
  onCreateAccount: () => void;
  onForgotPassword: () => void;
}

/**
 * The way in: an e-mail and password form, then Google
 * (`docs/specs/password-sign-in.md`, `docs/specs/authentication.md`).
 */
export function SignInScreen({
  email,
  onEmailChange,
  onCreateAccount,
  onForgotPassword,
}: SignInScreenProps) {
  const { signIn, signInWithPassword, googleAvailable } = useAuth();
  const theme = useTheme();
  const passwordRef = useRef<TextInput>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePasswordSignIn() {
    if (!email.trim() || !password) {
      setError('Enter your e-mail and password.');
      return;
    }
    setError(null);
    setBusy('password');
    try {
      await signInWithPassword(email, password);
    } catch (caught) {
      logger.warn('auth.sign_in.failed', { method: 'password', ...errorFields(caught) });
      setError(authErrorMessage(caught));
      setBusy(null);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setBusy('google');
    try {
      await signIn();
    } catch (caught) {
      if (!(caught instanceof GoogleSignInCancelled)) {
        logger.warn('auth.sign_in.failed', { method: 'google', ...errorFields(caught) });
        setError('Could not sign you in with Google. Please try again.');
      }
      setBusy(null);
    }
  }

  return (
    <AuthPage>
      <View style={styles.hero}>
        {/* The mark sits on its own brand wash, so it reads on both themes. */}
        <View style={[styles.logoDisc, { backgroundColor: theme.primarySoft }]}>
          <BrandMark size={72} />
        </View>
        <ThemedText type="title">Ardoise</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centered}>
          Share expenses with the people you split with.
        </ThemedText>
      </View>

      <View style={styles.form}>
        <EmailField
          value={email}
          onChangeText={onEmailChange}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          submitBehavior="submit"
        />
        <PasswordField
          ref={passwordRef}
          purpose="current"
          placeholder="Password"
          accessibilityLabel="Password"
          value={password}
          onChangeText={setPassword}
          returnKeyType="go"
          onSubmitEditing={() => void handlePasswordSignIn()}
        />
        <TextAction
          label="Forgot password?"
          onPress={onForgotPassword}
          style={styles.forgot}
        />
        {error ? (
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
            {error}
          </ThemedText>
        ) : null}
        <Button
          label="Sign in"
          onPress={() => void handlePasswordSignIn()}
          busy={busy === 'password'}
          disabled={busy !== null}
        />
      </View>

      <View>
        <OrDivider />
        <Button
          label="Continue with Google"
          variant="secondary"
          onPress={() => void handleGoogleSignIn()}
          busy={busy === 'google'}
          disabled={!googleAvailable || busy !== null}
        />
        {!googleAvailable ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
            Google sign-in on the web is coming soon.
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.footer}>
        <View style={styles.signUp}>
          <ThemedText type="small" themeColor="textSecondary">
            New to Ardoise?
          </ThemedText>
          <TextAction label="Create an account" onPress={onCreateAccount} />
        </View>

        {/* Continuing is how the terms are accepted (`docs/specs/legal-pages.md`). */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          By continuing, you agree to the <LegalLink page="terms" /> and acknowledge the{' '}
          <LegalLink page="privacy" />.
        </ThemedText>
      </View>
    </AuthPage>
  );
}

/** A legal page's name, inline in a sentence, opening it. */
function LegalLink({ page }: { page: LegalPage }) {
  const { label } = LEGAL_PAGES[page];
  return (
    <ThemedText
      type="small"
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => void openLegalPage(page)}
      style={styles.link}>
      {label}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  link: {
    textDecorationLine: 'underline',
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  logoDisc: {
    width: 108,
    height: 108,
    borderRadius: Radius.large,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  centered: {
    textAlign: 'center',
  },
  form: {
    gap: Spacing.three,
  },
  forgot: {
    alignSelf: 'flex-end',
  },
  caption: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  footer: {
    gap: Spacing.four,
  },
  signUp: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
