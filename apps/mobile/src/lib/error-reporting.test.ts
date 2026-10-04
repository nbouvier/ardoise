import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Breadcrumb, ErrorEvent } from '@sentry/react-native';

import { ApiError, NetworkError } from '@/lib/api/errors';

import { isReportable, scrubFields } from './error-reporting';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

const mockConfig: { extra: Record<string, unknown> } = { extra: {} };
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockConfig;
    },
  },
}));

const mockUpdates: { channel: string | null } = { channel: null };
jest.mock('expo-updates', () => ({
  get channel() {
    return mockUpdates.channel;
  },
}));

type ReportingModule = typeof import('./error-reporting');
type SentryMock = {
  init: jest.Mock;
  setUser: jest.Mock;
  addBreadcrumb: jest.Mock;
  captureException: jest.Mock;
  captureMessage: jest.Mock;
};

const DSN = 'https://public@o0.ingest.example.test/1';

/** A fresh copy of the module (its "started" flag is module state) and the Sentry mock it sees. */
function load(): { reporting: ReportingModule; sentry: SentryMock } {
  let loaded!: { reporting: ReportingModule; sentry: SentryMock };
  jest.isolateModules(() => {
    loaded = {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      reporting: require('./error-reporting'),
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      sentry: require('@sentry/react-native'),
    };
  });
  return loaded;
}

/** The options `Sentry.init` was called with. */
function initOptions(sentry: SentryMock) {
  return sentry.init.mock.calls[0]?.[0] as {
    dsn: string;
    environment: string;
    sendDefaultPii: boolean;
    beforeBreadcrumb: (breadcrumb: Breadcrumb) => Breadcrumb | null;
    beforeSend: (event: ErrorEvent) => ErrorEvent | null;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.extra = {};
  mockUpdates.channel = null;
});

describe('without a DSN', () => {
  it('does not start Sentry and reports nothing', () => {
    const { reporting, sentry } = load();

    reporting.initErrorReporting();
    reporting.reportError('error', 'thing.failed', new Error('boom'));
    reporting.addReportingBreadcrumb('info', 'thing.started');
    reporting.setReportingUser('user-1');

    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.addBreadcrumb).not.toHaveBeenCalled();
    expect(sentry.setUser).not.toHaveBeenCalled();
  });
});

describe('with a DSN', () => {
  beforeEach(() => {
    mockConfig.extra = { sentryDsn: DSN };
  });

  it('starts Sentry once, without personal data, in the build channel environment', () => {
    mockUpdates.channel = 'staging';
    const { reporting, sentry } = load();

    reporting.initErrorReporting();
    reporting.initErrorReporting();

    expect(sentry.init).toHaveBeenCalledTimes(1);
    expect(initOptions(sentry)).toMatchObject({
      dsn: DSN,
      environment: 'staging',
      sendDefaultPii: false,
    });
  });

  it('reports a build without a channel (development build) as development', () => {
    const { reporting, sentry } = load();

    reporting.initErrorReporting();

    expect(initOptions(sentry).environment).toBe('development');
  });

  it('reports an error under its event name with scrubbed context', () => {
    const { reporting, sentry } = load();
    reporting.initErrorReporting();
    const error = new TypeError('x is undefined');

    reporting.reportError('warn', 'groups.load.failed', error, {
      groupId: 'g-1',
      refreshToken: 'secret-value',
    });

    expect(sentry.captureException).toHaveBeenCalledWith(error, {
      level: 'warning',
      tags: { event: 'groups.load.failed' },
      extra: { groupId: 'g-1', refreshToken: '[redacted]' },
    });
  });

  it('reports an error event with no error as a message', () => {
    const { reporting, sentry } = load();
    reporting.initErrorReporting();

    reporting.reportError('error', 'thing.impossible', undefined);

    expect(sentry.captureMessage).toHaveBeenCalledWith('thing.impossible', {
      level: 'error',
      tags: { event: 'thing.impossible' },
      extra: undefined,
    });
  });

  it('identifies the user by opaque id only, and forgets them on sign-out', () => {
    const { reporting, sentry } = load();
    reporting.initErrorReporting();

    reporting.setReportingUser('11111111-1111-4111-8111-111111111111');
    reporting.setReportingUser(null);

    expect(sentry.setUser).toHaveBeenNthCalledWith(1, {
      id: '11111111-1111-4111-8111-111111111111',
    });
    expect(sentry.setUser).toHaveBeenNthCalledWith(2, null);
  });

  it('turns log events into breadcrumbs', () => {
    const { reporting, sentry } = load();
    reporting.initErrorReporting();

    reporting.addReportingBreadcrumb('warn', 'friends.list.failed', { errorName: 'NetworkError' });

    expect(sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'log',
      level: 'warning',
      message: 'friends.list.failed',
      data: { errorName: 'NetworkError' },
    });
  });

  describe('before a breadcrumb is kept', () => {
    function beforeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
      const { reporting, sentry } = load();
      reporting.initErrorReporting();
      return initOptions(sentry).beforeBreadcrumb(breadcrumb);
    }

    it('drops console breadcrumbs (the logger adds its own, scrubbed)', () => {
      expect(beforeBreadcrumb({ category: 'console', message: '[warn] x' })).toBeNull();
    });

    it('hides invitation codes in request URLs', () => {
      const kept = beforeBreadcrumb({
        category: 'fetch',
        data: { url: 'https://api.example.test/invites/AbC123/accept', method: 'POST' },
      });

      expect(kept?.data).toEqual({
        url: 'https://api.example.test/invites/[code]/accept',
        method: 'POST',
      });
    });

    it('hides invitation codes in navigation messages', () => {
      const kept = beforeBreadcrumb({ category: 'navigation', message: 'ardoise://invite/AbC123' });

      expect(kept?.message).toBe('ardoise://invite/[code]');
    });
  });

  it('scrubs the extra context of an event before it is sent', () => {
    const { reporting, sentry } = load();
    reporting.initErrorReporting();

    const sent = initOptions(sentry).beforeSend({
      type: undefined,
      extra: { email: 'ada@example.com', groupId: 'g-1' },
      request: { url: 'https://api.example.test/i/AbC123' },
    });

    expect(sent?.extra).toEqual({ email: '[redacted]', groupId: 'g-1' });
    expect(sent?.request?.url).toBe('https://api.example.test/i/[code]');
  });
});

describe('scrubFields', () => {
  it.each(['accessToken', 'refreshToken', 'idToken', 'authorization', 'password', 'email', 'amount', 'title', 'comment', 'name', 'groupName'])(
    'redacts %s',
    (key) => {
      expect(scrubFields({ [key]: 'value' })).toEqual({ [key]: '[redacted]' });
    },
  );

  it('keeps diagnostic fields', () => {
    const fields = { errorName: 'TypeError', errorMessage: 'boom', groupId: 'g-1', status: 500 };

    expect(scrubFields(fields)).toEqual(fields);
  });
});

describe('isReportable', () => {
  it.each([
    ['no connection', new NetworkError()],
    ['an API refusal', new ApiError(404, 'group_not_found')],
    ['a server failure (the server reports it)', new ApiError(500, 'internal_error')],
    ['a cancelled Google dialog', Object.assign(new Error('cancelled'), { name: 'GoogleSignInCancelled' })],
  ])('ignores %s', (_label, error) => {
    expect(isReportable(error)).toBe(false);
  });

  it.each([
    ['a bug', new TypeError('x is undefined')],
    ['a Google sign-in failure', Object.assign(new Error('DEVELOPER_ERROR'), { name: 'GoogleSignInError' })],
    ['a thrown non-error', 'something odd'],
  ])('reports %s', (_label, error) => {
    expect(isReportable(error)).toBe(true);
  });
});
