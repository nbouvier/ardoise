import type { ConfigContext, ExpoConfig } from 'expo/config';

/** What a legal Android application id looks like: dot-separated, letters/digits/underscores. */
const APP_ID_FORMAT = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

/** The id the Expo template ships with: fine to develop under, never to publish under. */
const PLACEHOLDER_APP_ID = /^com\.anonymous(\.|$)/;

/**
 * Builds installed next to the production app, chosen by `APP_VARIANT` (set by the
 * `staging` EAS profile and the staging updates): their own application id and name, so
 * that installing one never replaces the other and the two are told apart on the phone.
 */
const VARIANTS = {
  staging: { idSuffix: '.staging', nameSuffix: ' (staging)' },
} as const;

type Variant = (typeof VARIANTS)[keyof typeof VARIANTS];

function resolveVariant(): Variant | null {
  const variant = process.env.APP_VARIANT;
  if (!variant) return null;
  if (!Object.hasOwn(VARIANTS, variant)) {
    throw new Error(
      `APP_VARIANT "${variant}" is unknown (expected one of: ${Object.keys(VARIANTS).join(', ')})`,
    );
  }
  return VARIANTS[variant as keyof typeof VARIANTS];
}

/**
 * The application id (Android package, iOS bundle identifier): what `app.json` says,
 * unless `APP_ID` overrides it (a fork publishing its own build). It is permanent once
 * an app is published, so it is one value applied to both platforms. An EAS
 * `production*` build refuses the template placeholder, so that a release cannot go
 * out under an id that cannot be kept.
 */
function resolveAppId(config: Partial<ExpoConfig>): string {
  const appId = process.env.APP_ID ?? config.android?.package ?? 'app.nbouvier.ardoise';

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
 * Sentry's config plugin, which uploads the JavaScript source maps and native debug
 * symbols of a release build so that reported stack traces are readable. Organization
 * and project come from `SENTRY_ORG` / `SENTRY_PROJECT` and the upload authenticates
 * with `SENTRY_AUTH_TOKEN`: EAS environment variables, never committed. Debug builds
 * upload nothing. See "Error reporting (Sentry)" in `docs/MOBILE.md`.
 */
function sentryPlugin(): [string, Record<string, string>] {
  const options: Record<string, string> = {};
  if (process.env.SENTRY_ORG) options.organization = process.env.SENTRY_ORG;
  if (process.env.SENTRY_PROJECT) options.project = process.env.SENTRY_PROJECT;
  if (process.env.SENTRY_URL) options.url = process.env.SENTRY_URL;
  return ['@sentry/react-native/expo', options];
}

/**
 * Layers environment-driven values onto the static config in `app.json`:
 * the application id and name (with the build's variant), the API base URL, the Google OAuth client IDs (not secret),
 * the iOS URL scheme the Google SDK needs and the Sentry DSN (not secret either: it
 * only lets a client send reports). See `docs/MOBILE.md`.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = resolveVariant();
  const baseAppId = resolveAppId(config);
  const appId = baseAppId + (variant?.idSuffix ?? '');
  const iosBundleId =
    (process.env.APP_ID ?? config.ios?.bundleIdentifier ?? baseAppId) + (variant?.idSuffix ?? '');
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? null;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? null;
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
  const sentryDsn = process.env.SENTRY_DSN || null;

  const iosUrlScheme = iosClientId
    ? `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`
    : undefined;

  const basePlugins = (config.plugins ?? []).filter(
    (plugin) =>
      (Array.isArray(plugin) ? plugin[0] : plugin) !==
      '@react-native-google-signin/google-signin',
  );

  // `eas init` writes the project id under `extra.eas` of app.json; the update URL is
  // derived from it so the id is written once. No project yet, no URL: expo-updates
  // then stays inert (development builds, local runs).
  const easProjectId = (config.extra?.eas as { projectId?: string } | undefined)?.projectId;

  return {
    ...config,
    ...(easProjectId
      ? { updates: { ...config.updates, url: `https://u.expo.dev/${easProjectId}` } }
      : {}),
    name: (config.name ?? 'Ardoise') + (variant?.nameSuffix ?? ''),
    slug: config.slug ?? 'ardoise',
    android: {
      ...config.android,
      package: appId,
    },
    ios: {
      ...config.ios,
      bundleIdentifier: iosBundleId,
    },
    plugins: [
      ...basePlugins,
      iosUrlScheme
        ? ['@react-native-google-signin/google-signin', { iosUrlScheme }]
        : '@react-native-google-signin/google-signin',
      sentryPlugin(),
    ],
    extra: {
      ...config.extra,
      apiBaseUrl,
      googleWebClientId: webClientId,
      googleIosClientId: iosClientId,
      sentryDsn,
    },
  };
};
