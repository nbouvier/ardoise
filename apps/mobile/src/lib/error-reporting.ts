import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

import { ApiError, NetworkError } from '@/lib/api/errors';

/**
 * Crash and error reporting to Sentry (`docs/LOGGING.md`, "Error reporting").
 *
 * Off unless the build carries a DSN (`SENTRY_DSN`, read through the Expo
 * config `extra`): development builds, the web target and tests report nothing. When on,
 * Sentry catches what nothing else does — uncaught JavaScript errors, unhandled promise
 * rejections, native crashes — and `logger` feeds it the rest (`src/lib/logger.ts`).
 */

type Fields = Record<string, unknown>;

let enabled = false;

/** Field names whose values never leave the device, whatever they hold. */
const SENSITIVE_KEY =
  /token|authorization|password|secret|cookie|e-?mail|amount|title|comment|picture|name$/i;

/** Keys `SENSITIVE_KEY` would catch but that only ever hold diagnostic text. */
const SAFE_KEYS = new Set(['errorName']);

/**
 * Invitation codes travel in URLs (`/invites/<code>`, `/i/<code>`, `ardoise://invite/<code>`)
 * and anyone holding one can join the group: they are bearer secrets, not context.
 */
const INVITE_CODE_IN_URL = /(\/(?:invites?|i)\/)[^/?#\s]+/gi;

export function redactUrl(url: string): string {
  return url.replace(INVITE_CODE_IN_URL, '$1[code]');
}

/** A copy of `fields` without the values that must not be reported. */
export function scrubFields(fields: Fields): Fields {
  const scrubbed: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_KEY.test(key) && !SAFE_KEYS.has(key)) {
      scrubbed[key] = '[redacted]';
    } else if (typeof value === 'string') {
      scrubbed[key] = redactUrl(value);
    } else {
      scrubbed[key] = value;
    }
  }
  return scrubbed;
}

/**
 * Whether a handled failure is worth an issue in Sentry. The expected ones are not:
 * no connection (`NetworkError`), an API refusal or a server failure (`ApiError` — the
 * server reports its own 5xx), the user closing the Google dialog. Anything else
 * reaching a `catch` — a contract mismatch, a native module failing, a plain bug — is.
 */
export function isReportable(error: unknown): boolean {
  if (error instanceof NetworkError || error instanceof ApiError) {
    return false;
  }
  return !(error instanceof Error && error.name === 'GoogleSignInCancelled');
}

function sentryDsn(): string | undefined {
  const value = Constants.expoConfig?.extra?.sentryDsn;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Start reporting, once, before the first render. The environment is the build's EAS
 * Update channel (`staging`, `production`): the channel is fixed per build profile
 * (`eas.json`), so a staging build reports as staging even after an update.
 */
export function initErrorReporting(): void {
  const dsn = sentryDsn();
  if (enabled || !dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: Updates.channel ?? 'development',
    // No IP address, no device name, no request bodies; the user is an opaque id only.
    // No `tracesSampleRate` and no replay integration: errors only, within the free quota.
    sendDefaultPii: false,
    beforeBreadcrumb(breadcrumb) {
      // `logger` already adds a breadcrumb per event, with scrubbed fields; the console
      // copy of the same line would only duplicate it, unscrubbed.
      if (breadcrumb.category === 'console') {
        return null;
      }
      if (breadcrumb.message) {
        breadcrumb.message = redactUrl(breadcrumb.message);
      }
      if (breadcrumb.data) {
        breadcrumb.data = scrubFields(breadcrumb.data);
      }
      return breadcrumb;
    },
    beforeSend(event) {
      if (event.request?.url) {
        event.request.url = redactUrl(event.request.url);
      }
      if (event.extra) {
        event.extra = scrubFields(event.extra);
      }
      return event;
    },
  });
  enabled = true;
}

/** Attach later reports to this user (opaque internal id only), or detach with `null`. */
export function setReportingUser(userId: string | null): void {
  if (enabled) {
    Sentry.setUser(userId ? { id: userId } : null);
  }
}

/** Leave a trail entry: the events that led to the next report. */
export function addReportingBreadcrumb(
  level: 'debug' | 'info' | 'warn' | 'error',
  event: string,
  fields?: Fields,
): void {
  if (enabled) {
    Sentry.addBreadcrumb({
      category: 'log',
      level: level === 'warn' ? 'warning' : level,
      message: event,
      data: fields ? scrubFields(fields) : undefined,
    });
  }
}

/** Report a failure under its log event name, grouped by the error's own stack. */
export function reportError(
  level: 'warn' | 'error',
  event: string,
  error: unknown,
  fields?: Fields,
): void {
  if (!enabled) {
    return;
  }
  const context = {
    level: level === 'warn' ? ('warning' as const) : ('error' as const),
    tags: { event },
    extra: fields ? scrubFields(fields) : undefined,
  };
  if (error === undefined) {
    Sentry.captureMessage(event, context);
  } else {
    Sentry.captureException(error, context);
  }
}
