import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider } from '@/features/auth/auth-context';
import { AuthGate } from '@/features/auth/auth-gate';
import { InviteLinkHandler } from '@/features/invites/invite-link-handler';
import { InvitePrompt } from '@/features/invites/invite-prompt';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <AnimatedSplashOverlay />
        {/* Above the gate: an invitation may arrive before there is an account. */}
        <InviteLinkHandler />
        <AuthGate>
          {/* A stack around the tabs, so a group opens on top of them. */}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="groups/[id]"
              options={{ headerShown: true, headerTitle: '', headerBackTitle: 'Groups' }}
            />
          </Stack>
          <InvitePrompt />
        </AuthGate>
      </AuthProvider>
    </ThemeProvider>
  );
}
