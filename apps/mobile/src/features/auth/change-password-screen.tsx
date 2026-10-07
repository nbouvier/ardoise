import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@ardoise/shared';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { Button } from '@/components/button';
import { DismissiblePage } from '@/components/dismissible-page';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorFields, logger } from '@/lib/logger';

import { authErrorMessage } from './auth-errors';
import { PasswordField } from './password-field';
import { useAuth } from './use-auth';

export interface ChangePasswordScreenProps {
  onClose: () => void;
}

/**
 * Change the password of an account that has one: the current password, then
 * the new one. Every other device is signed out; this one stays
 * (`docs/specs/password-sign-in.md`).
 */
export function ChangePasswordScreen({ onClose }: ChangePasswordScreenProps) {
  const { changePassword } = useAuth();
  const theme = useTheme();
  const nextRef = useRef<TextInput>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!current) {
      setError('Enter your current password.');
      return;
    }
    if (next.length < PASSWORD_MIN_LENGTH || next.length > PASSWORD_MAX_LENGTH) {
      setError(`Choose a new password of ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await changePassword(current, next);
      setDone(true);
    } catch (caught) {
      logger.warn('auth.password.change.failed', errorFields(caught));
      setError(authErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DismissiblePage
      onClose={onClose}
      style={{ backgroundColor: theme.background }}
      header={
        <ScreenHeader
          title="Change password"
          wash
          action={<BackButton icon="collapse" label="Close" onPress={onClose} />}
        />
      }>
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {done ? (
            <>
              <ThemedText accessibilityRole="alert">
                Your password has been changed. Your other devices have been signed out.
              </ThemedText>
              <Button label="Done" onPress={onClose} />
            </>
          ) : (
            <>
              <PasswordField
                purpose="current"
                placeholder="Current password"
                accessibilityLabel="Current password"
                value={current}
                onChangeText={setCurrent}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => nextRef.current?.focus()}
              />
              <View style={styles.field}>
                <PasswordField
                  ref={nextRef}
                  purpose="new"
                  placeholder="New password"
                  accessibilityLabel="New password"
                  value={next}
                  onChangeText={setNext}
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
              <Button label="Change password" onPress={() => void submit()} busy={busy} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </DismissiblePage>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.three,
  },
  field: {
    gap: Spacing.one,
  },
});
