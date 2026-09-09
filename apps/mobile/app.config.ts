import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Layers environment-driven values onto the static config in `app.json`:
 * the API base URL, the Google OAuth client IDs (not secret) and the iOS URL
 * scheme the Google SDK needs. See `docs/MOBILE.md`.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? null;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? null;
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

  const iosUrlScheme = iosClientId
    ? `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`
    : undefined;

  const basePlugins = (config.plugins ?? []).filter(
    (plugin) =>
      (Array.isArray(plugin) ? plugin[0] : plugin) !==
      '@react-native-google-signin/google-signin',
  );

  return {
    ...config,
    name: config.name ?? 'SplitCount',
    slug: config.slug ?? 'splitcount',
    ios: {
      ...config.ios,
      bundleIdentifier: config.ios?.bundleIdentifier ?? 'com.anonymous.splitcount',
    },
    plugins: [
      ...basePlugins,
      iosUrlScheme
        ? ['@react-native-google-signin/google-signin', { iosUrlScheme }]
        : '@react-native-google-signin/google-signin',
    ],
    extra: {
      ...config.extra,
      apiBaseUrl,
      googleWebClientId: webClientId,
      googleIosClientId: iosClientId,
    },
  };
};
