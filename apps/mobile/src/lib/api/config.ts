import Constants from 'expo-constants';

const DEFAULT_BASE_URL = 'http://localhost:3000';

/**
 * Base URL of the Ardoise API. Sourced from the Expo config `extra`
 * (`app.config.ts`, driven by `EXPO_PUBLIC_API_BASE_URL`), falling back to the
 * local dev server.
 */
export function getApiBaseUrl(): string {
  const fromExtra = Constants.expoConfig?.extra?.apiBaseUrl;
  if (typeof fromExtra === 'string' && fromExtra.length > 0) {
    return fromExtra;
  }
  return process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_BASE_URL;
}
