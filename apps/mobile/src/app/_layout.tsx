import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Colors } from '@/constants/theme';
import { AuthProvider } from '@/features/auth/auth-context';
import { AuthGate } from '@/features/auth/auth-gate';
import { InviteLinkHandler } from '@/features/invites/invite-link-handler';
import { InvitePrompt } from '@/features/invites/invite-prompt';

SplashScreen.preventAutoHideAsync();

/**
 * React Navigation's own palette, driven by SplitCount's tokens — otherwise the
 * stack header and the gap between screens fall back to its grey-on-white
 * defaults and break the tinted canvas everywhere a screen is pushed.
 */
function navigationTheme(dark: boolean): Theme {
  const base = dark ? DarkTheme : DefaultTheme;
  const palette = dark ? Colors.dark : Colors.light;

  return {
    ...base,
    dark,
    colors: {
      ...base.colors,
      primary: palette.primary,
      background: palette.background,
      card: palette.background,
      text: palette.text,
      border: palette.border,
      notification: palette.accent,
    },
  };
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={navigationTheme(colorScheme === 'dark')}>
      <AuthProvider>
        <AnimatedSplashOverlay />
        {/* Above the gate: an invitation may arrive before there is an account. */}
        <InviteLinkHandler />
        <AuthGate>
          {/* A stack around the tabs, so a group opens on top of them. Its own
              header (with the way back) is drawn by the group screen. */}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="groups/[id]" />
          </Stack>
          <InvitePrompt />
        </AuthGate>
      </AuthProvider>
    </ThemeProvider>
  );
}
