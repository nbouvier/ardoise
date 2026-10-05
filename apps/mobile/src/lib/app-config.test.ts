import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import appConfig from '../../app.config';

// Lives under src/ on purpose: next to app.config.ts, importing '@jest/globals' from the
// first file tsc sees changes which global `fetch` typing wins, and breaks the typecheck of
// every test that mocks fetch.

type ExpoConfig = ReturnType<typeof appConfig>;
type ConfigContext = Parameters<typeof appConfig>[0];

const PLACEHOLDER = 'com.anonymous.ardoise';

const base: ExpoConfig = {
  name: 'Ardoise',
  slug: 'ardoise',
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
    delete process.env.APP_VARIANT;
    delete process.env.EAS_BUILD_PROFILE;
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_ORG;
    delete process.env.SENTRY_PROJECT;
    delete process.env.SENTRY_URL;
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

  describe('variants', () => {
    const real: ExpoConfig = { ...base, android: { package: 'app.example.ardoise' } };

    it('is the production app when no variant is set', () => {
      const config = resolve(real);

      expect(config.name).toBe('Ardoise');
      expect(config.android?.package).toBe('app.example.ardoise');
    });

    it('gives the staging app its own id and name, so it installs next to production', () => {
      process.env.APP_VARIANT = 'staging';

      const config = resolve(real);

      expect(config.name).toBe('Ardoise (staging)');
      expect(config.android?.package).toBe('app.example.ardoise.staging');
      expect(config.ios?.bundleIdentifier).toBe('app.example.ardoise.staging');
    });

    it('applies the variant to an APP_ID override too', () => {
      process.env.APP_ID = 'app.example.split';
      process.env.APP_VARIANT = 'staging';

      expect(resolve().android?.package).toBe('app.example.split.staging');
    });

    it('refuses an unknown variant rather than building the production app', () => {
      process.env.APP_VARIANT = 'stagging';

      expect(() => resolve(real)).toThrow(/APP_VARIANT/);
    });
  });

  describe('over-the-air updates', () => {
    it('points updates at the EAS project once `eas init` wrote its id', () => {
      const config = resolve({
        ...base,
        updates: { fallbackToCacheTimeout: 0 },
        extra: { eas: { projectId: '00000000-1111-2222-3333-444444444444' } },
      });

      expect(config.updates).toEqual({
        fallbackToCacheTimeout: 0,
        url: 'https://u.expo.dev/00000000-1111-2222-3333-444444444444',
      });
      // The project id must survive the `extra` rebuilt by app.config.ts.
      expect(config.extra?.eas).toEqual({ projectId: '00000000-1111-2222-3333-444444444444' });
    });

    it('sets no update URL before there is an EAS project', () => {
      const config = resolve({ ...base, updates: { fallbackToCacheTimeout: 0 } });

      expect(config.updates).toEqual({ fallbackToCacheTimeout: 0 });
    });
  });

  describe('error reporting', () => {
    function sentryPlugin(config: ExpoConfig) {
      return config.plugins?.find(
        (plugin) => Array.isArray(plugin) && plugin[0] === '@sentry/react-native/expo',
      );
    }

    it('carries the DSN to the app when the build sets one', () => {
      process.env.SENTRY_DSN = 'https://public@o0.ingest.example.test/1';

      expect(resolve().extra?.sentryDsn).toBe('https://public@o0.ingest.example.test/1');
    });

    it('has no DSN, so reports nothing, when the build sets none', () => {
      expect(resolve().extra?.sentryDsn).toBeNull();
    });

    it('configures the source-map upload from the environment', () => {
      process.env.SENTRY_ORG = 'example-org';
      process.env.SENTRY_PROJECT = 'example-mobile';

      expect(sentryPlugin(resolve())).toEqual([
        '@sentry/react-native/expo',
        { organization: 'example-org', project: 'example-mobile' },
      ]);
    });

    it('keeps the plugin, with nothing in it, outside a release build', () => {
      expect(sentryPlugin(resolve())).toEqual(['@sentry/react-native/expo', {}]);
    });
  });
});
