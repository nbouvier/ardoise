import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { initErrorReporting, redactUrl, reportError, scrubEvent } from './error-reporting.js';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
  onUnhandledRejectionIntegration: vi.fn((options: unknown) => ({
    name: 'OnUnhandledRejection',
    options,
  })),
}));

const DSN = 'https://public@o0.ingest.example.test/1';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('initErrorReporting', () => {
  it('starts nothing without a DSN', () => {
    initErrorReporting({ dsn: undefined, environment: 'development', release: undefined });

    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('starts Sentry for the environment and release, collecting no request or user data', () => {
    initErrorReporting({ dsn: DSN, environment: 'staging', release: 'sha-abc1234' });

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: DSN,
        environment: 'staging',
        release: 'sha-abc1234',
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
          stackFrameVariables: false,
          databaseQueryData: false,
        },
        includeLocalVariables: false,
        beforeSend: scrubEvent,
      }),
    );
  });

  /** The integrations `init` ends up with, given the SDK's defaults. */
  function integrationsFrom(defaults: { name: string }[]) {
    initErrorReporting({ dsn: DSN, environment: 'production', release: undefined });
    const options = vi.mocked(Sentry.init).mock.calls[0]?.[0] as {
      integrations: (defaults: { name: string }[]) => { name: string; options?: unknown }[];
    };
    return options.integrations(defaults);
  }

  it('keeps Node’s behaviour of exiting on an unhandled rejection', () => {
    const integrations = integrationsFrom([{ name: 'OnUnhandledRejection' }]);

    expect(integrations).toEqual([{ name: 'OnUnhandledRejection', options: { mode: 'strict' } }]);
  });

  it('leaves request failures to the error handler, not to the Fastify integration', () => {
    const integrations = integrationsFrom([{ name: 'Fastify' }, { name: 'Http' }]);

    expect(integrations.map(({ name }) => name)).toEqual(['Http', 'OnUnhandledRejection']);
  });
});

describe('reportError', () => {
  it('reports the error tagged with its log event name', () => {
    const error = new Error('boom');

    reportError(error, 'db.pool.error', { attempt: 2 });

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { event: 'db.pool.error' },
      extra: { attempt: 2 },
    });
  });
});

describe('scrubEvent', () => {
  it('keeps only the method and the URL of the request a failure happened in', () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        method: 'POST',
        url: 'https://api.example.test/groups/g-1/transactions',
        headers: { authorization: 'Bearer secret-token', 'user-agent': 'okhttp' },
        cookies: { session: 'abc' },
        data: { title: 'Dinner', amountCents: 4200 },
        query_string: 'from=2026-01-01',
      },
    };

    expect(scrubEvent(event).request).toEqual({
      method: 'POST',
      url: 'https://api.example.test/groups/g-1/transactions',
    });
  });

  it('hides an invitation code in the URL', () => {
    const event: ErrorEvent = {
      type: undefined,
      request: { method: 'GET', url: 'https://api.example.test/invites/AbC123/accept' },
    };

    expect(scrubEvent(event).request?.url).toBe('https://api.example.test/invites/[code]/accept');
  });

  it('redacts sensitive extra fields and keeps diagnostic ones', () => {
    const event: ErrorEvent = {
      type: undefined,
      extra: {
        refreshToken: 'r',
        email: 'ada@example.com',
        route: '/groups/:groupId',
        status: 500,
      },
    };

    expect(scrubEvent(event).extra).toEqual({
      refreshToken: '[redacted]',
      email: '[redacted]',
      route: '/groups/:groupId',
      status: 500,
    });
  });
});

describe('redactUrl', () => {
  it.each([
    ['https://api.example.test/i/AbC123', 'https://api.example.test/i/[code]'],
    ['/invites/AbC123?x=1', '/invites/[code]?x=1'],
    ['/groups/g-1/invite/rotate', '/groups/g-1/invite/rotate'],
  ])('%s → %s', (url, expected) => {
    expect(redactUrl(url)).toBe(expected);
  });
});
