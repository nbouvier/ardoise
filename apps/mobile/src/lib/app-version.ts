import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/**
 * What the app is running, for the Account screen: the binary's version, its update
 * channel (`staging`, `production`; `development` for a build without one) and which
 * JavaScript runs — the one built into the binary, or an over-the-air update (first 8
 * characters of its id, as listed on expo.dev). Enough to tell, from a screenshot,
 * whether an update reached a phone.
 */
export function appVersionLabel(): string {
  const version = Constants.expoConfig?.version ?? 'unknown';
  const channel = Updates.channel ?? 'development';
  const code =
    Updates.isEmbeddedLaunch || !Updates.updateId
      ? 'built-in'
      : `update ${Updates.updateId.slice(0, 8)}`;
  return `Version ${version} · ${channel} · ${code}`;
}
