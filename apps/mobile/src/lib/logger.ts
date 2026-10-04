/**
 * Minimal structured logger for the mobile app. Application code logs through
 * this module, never `console` directly (see `docs/guidelines/LOGGING.md`).
 *
 * Two sinks: the console, and error reporting (`src/lib/error-reporting.ts`), which
 * is a no-op unless the build carries a Sentry DSN. Every event becomes a breadcrumb
 * there; an `error`, or a `warn` carrying an unexpected error, becomes an issue.
 */

import { addReportingBreadcrumb, isReportable, reportError } from './error-reporting';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogFields = Record<string, unknown>;

/**
 * Where `errorFields` keeps the original error: the logged fields stay plain text,
 * while error reporting still gets the real error and its stack. A symbol key, so it
 * is carried through `{ ...fields }` but never printed as a field.
 */
const ORIGINAL_ERROR = Symbol('originalError');

type CarryingFields = LogFields & { [ORIGINAL_ERROR]?: unknown };

function emit(level: LogLevel, event: string, fields?: CarryingFields): void {
  if (level === 'debug' && !__DEV__) {
    return;
  }

  const { [ORIGINAL_ERROR]: error, ...rest } = fields ?? {};
  const plainFields = fields ? rest : undefined;

  addReportingBreadcrumb(level, event, plainFields);
  if (level === 'error' || (level === 'warn' && error !== undefined && isReportable(error))) {
    reportError(level, event, error, plainFields);
  }

  if (process.env.NODE_ENV === 'test') {
    return;
  }
  const payload: LogFields = { level, event, ...plainFields };
  const sink =
    level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(`[${level}] ${event}`, plainFields ? payload : '');
}

export const logger = {
  debug: (event: string, fields?: LogFields) => emit('debug', event, fields),
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
};

/**
 * Serialise an unknown error into log-safe fields (no secrets, no huge payloads).
 * The original error rides along, unprinted, for error reporting.
 */
export function errorFields(error: unknown): LogFields {
  const fields: CarryingFields =
    error instanceof Error
      ? { errorName: error.name, errorMessage: error.message }
      : { errorMessage: String(error) };
  fields[ORIGINAL_ERROR] = error;
  return fields;
}
