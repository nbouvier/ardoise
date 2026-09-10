import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AuthProvider } from '@/features/auth/auth-context';
import { AuthGate } from '@/features/auth/auth-gate';
import { InviteLinkHandler } from '@/features/friends/invite-link-handler';
import { InvitePrompt } from '@/features/friends/invite-prompt';

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
          <AppTabs />
          <InvitePrompt />
        </AuthGate>
      </AuthProvider>
    </ThemeProvider>
  );
}
