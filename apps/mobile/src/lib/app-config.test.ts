import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import appConfig from '../../app.config';

// Lives under src/ on purpose: next to app.config.ts, importing '@jest/globals' from the
// first file tsc sees changes which global `fetch` typing wins, and breaks the typecheck of
// every test that mocks fetch.

type ExpoConfig = ReturnType<typeof appConfig>;
type ConfigContext = Parameters<typeof appConfig>[0];

const PLACEHOLDER = 'com.anonymous.splitcount';

const base: ExpoConfig = {
  name: 'SplitCount',
  slug: 'splitcount',
  android: { package: PLACEHOLDER },
  plugins: [],
};

function resolve(config: ExpoConfig = base): ExpoConfig {
  return appConfig({ config } as ConfigContext);
}

describe('app.config', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.APP_ID;
    delete process.env.EAS_BUILD_PROFILE;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  describe('application id', () => {
    it('keeps the id from app.json when APP_ID is not set', () => {
      const config = resolve();

      expect(config.android?.package).toBe(PLACEHOLDER);
      expect(config.ios?.bundleIdentifier).toBe(PLACEHOLDER);
    });

    it('lets APP_ID set the Android package and the iOS bundle identifier', () => {
      process.env.APP_ID = 'app.example.split';

      const config = resolve();

      expect(config.android?.package).toBe('app.example.split');
      expect(config.ios?.bundleIdentifier).toBe('app.example.split');
    });

    it.each(['example', 'com..app', '1com.app', 'com.app-name', 'com.example. app'])(
      'rejects %j as an application id',
      (appId) => {
        process.env.APP_ID = appId;

        expect(() => resolve()).toThrow(/APP_ID/);
      },
    );

    it.each(['production', 'production-apk'])(
      'refuses to build the %s profile under the template placeholder',
      (profile) => {
        process.env.EAS_BUILD_PROFILE = profile;

        expect(() => resolve()).toThrow(/placeholder/);
      },
    );

    it('builds a production profile under a real id', () => {
      process.env.EAS_BUILD_PROFILE = 'production';
      process.env.APP_ID = 'app.example.split';

      expect(resolve().android?.package).toBe('app.example.split');
    });

    it.each(['staging', 'development'])(
      'allows the placeholder in the %s profile',
      (profile) => {
        process.env.EAS_BUILD_PROFILE = profile;

        expect(resolve().android?.package).toBe(PLACEHOLDER);
      },
    );

    it('allows the placeholder outside EAS (local development builds)', () => {
      expect(() => resolve()).not.toThrow();
    });
  });
});
