import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

export interface AuthPageProps {
  /** Omitted on the sign-in screen, which brings its own hero. */
  title?: string;
  subtitle?: ReactNode;
  /** The way back to the previous signed-out step. */
  onBack?: () => void;
  children: ReactNode;
}

/**
 * The frame of every signed-out screen: a narrow centred column that scrolls,
 * and moves out of the keyboard's way.
 */
export function AuthPage({ title, subtitle, onBack, children }: AuthPageProps) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.container}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {onBack ? (
              <View style={styles.back}>
                <BackButton onPress={onBack} />
              </View>
            ) : null}
            {title ? (
              <View style={styles.heading}>
                <ThemedText type="title" accessibilityRole="header">
                  {title}
                </ThemedText>
                {subtitle ? <ThemedText themeColor="textSecondary">{subtitle}</ThemedText> : null}
              </View>
            ) : null}
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
    gap: Spacing.five,
  },
  back: {
    alignSelf: 'flex-start',
  },
  heading: {
    gap: Spacing.two,
  },
});
