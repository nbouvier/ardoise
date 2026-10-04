import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';

/**
 * Error reporting to Sentry (`docs/LOGGING.md`, "Error reporting (Sentry)").
 *
 * The logs say what happened but nobody watches them; Sentry turns the failures that
 * need a human into issues and e-mails. Off without a DSN (local development, tests):
 * every function here is then a no-op. Started once, by the process entry point.
 */

export interface ErrorReportingOptions {
  dsn: string | undefined;
  environment: string;
  release: string | undefined;
}

/** Field names whose values are never reported, whatever they hold. */
const SENSITIVE_KEY = /token|authorization|password|secret|cookie|e-?mail|amount|title|comment|detail/i;

/**
 * Invitation codes travel in URLs (`/invites/<code>`, `/i/<code>`) and anyone holding
 * one can join the group: they are bearer secrets, not context.
 */
const INVITE_CODE_IN_URL = /(\/(?:invites|i)\/)[^/?#\s]+/gi;

export function redactUrl(url: string): string {
  return url.replace(INVITE_CODE_IN_URL, '$1[code]');
}

function scrubFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[redacted]' : typeof value === 'string' ? redactUrl(value) : value,
    ]),
  );
}

/**
 * The last look at an event before it leaves the machine. The SDK attaches the HTTP
 * request a failure happened in: its headers carry the `Authorization` bearer token,
 * its body the user's own data (amounts, titles), its query string and URL may carry
 * an invitation code. Only the method and the redacted URL survive.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    event.request = {
      method: event.request.method,
      url: event.request.url ? redactUrl(event.request.url) : undefined,
    };
  }
  if (event.extra) {
    event.extra = scrubFields(event.extra);
  }
  return event;
}

export function initErrorReporting(options: ErrorReportingOptions): void {
  if (!options.dsn) {
    return;
  }
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    // The SDK collects all of these by default. None is needed to diagnose a failure,
    // and each can hold a token or a user's own data: request headers carry the
    // `Authorization` bearer, bodies the amounts and titles, local variables anything.
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
    // No `tracesSampleRate`: errors only, no performance tracing.
    integrations: (defaults) => [
      // `Fastify` captures every 5xx on its own, untagged, and the SDK's de-duplication
      // then drops the tagged report of `http.request.failed`: the error handler is the
      // one place a request failure is reported.
      ...defaults.filter(
        ({ name }) => name !== 'Fastify' && name !== 'OnUnhandledRejection',
      ),
      // Report an unhandled rejection, then exit as Node does without Sentry (`warn`,
      // the SDK default, would log it and keep a process in an unknown state running).
      // Docker restarts the container.
      Sentry.onUnhandledRejectionIntegration({ mode: 'strict' }),
    ],
    beforeSend: scrubEvent,
  });
}

/**
 * Report a failure under its log event name (tagged `event`, so the log line and the
 * Sentry issue are the same thing). `context` is extra, scrubbed, detail.
 */
export function reportError(
  error: unknown,
  event: string,
  context?: Record<string, unknown>,
): void {
  Sentry.captureException(error, { tags: { event }, extra: context });
}

/**
 * Wait (at most `timeoutMs`) for queued reports to be sent. Reports go out in the
 * background: a process that exits right after one would drop it.
 */
export async function flushErrorReports(timeoutMs = 2000): Promise<void> {
  await Sentry.flush(timeoutMs);
}
