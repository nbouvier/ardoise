import type { ConfigContext, ExpoConfig } from 'expo/config';

/** What a legal Android application id looks like: dot-separated, letters/digits/underscores. */
const APP_ID_FORMAT = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

/** The id the Expo template ships with: fine to develop under, never to publish under. */
const PLACEHOLDER_APP_ID = /^com\.anonymous(\.|$)/;

/**
 * The application id (Android package, iOS bundle identifier): `APP_ID` when set,
 * else what `app.json` says. It is permanent once an app is published, and the
 * product name is not final, so it is one variable rather than a literal in two places.
 * An EAS `production*` build refuses the template placeholder, so that a release
 * cannot go out under an id that cannot be kept.
 */
function resolveAppId(config: Partial<ExpoConfig>): string {
  const appId = process.env.APP_ID ?? config.android?.package ?? 'com.anonymous.splitcount';

  if (!APP_ID_FORMAT.test(appId)) {
    throw new Error(`APP_ID "${appId}" is not a valid application id (for example com.example.app)`);
  }
  if (process.env.EAS_BUILD_PROFILE?.startsWith('production') && PLACEHOLDER_APP_ID.test(appId)) {
    throw new Error(
      `"${appId}" is the template placeholder: set APP_ID to the real application id before a production build`,
    );
  }
  return appId;
}

/**
 * Layers environment-driven values onto the static config in `app.json`:
 * the application id, the API base URL, the Google OAuth client IDs (not secret)
 * and the iOS URL scheme the Google SDK needs. See `docs/MOBILE.md`.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const appId = resolveAppId(config);
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
    android: {
      ...config.android,
      package: appId,
    },
    ios: {
      ...config.ios,
      bundleIdentifier: process.env.APP_ID ?? config.ios?.bundleIdentifier ?? appId,
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
