/**
 * Minimal structured logger for the mobile app. Application code logs through
 * this module, never `console` directly (see `docs/guidelines/LOGGING.md`).
 *
 * For now it writes to the console sink; it centralises the call site so a real
 * transport (remote logging) can be added later without touching callers.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogFields = Record<string, unknown>;

function emit(level: LogLevel, event: string, fields?: LogFields): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  if (level === 'debug' && !__DEV__) {
    return;
  }

  const payload: LogFields = { level, event, ...fields };
  const sink =
    level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(`[${level}] ${event}`, fields ? payload : '');
}

export const logger = {
  debug: (event: string, fields?: LogFields) => emit('debug', event, fields),
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
};

/** Serialise an unknown error into log-safe fields (no secrets, no huge payloads). */
export function errorFields(error: unknown): LogFields {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message };
  }
  return { errorMessage: String(error) };
}
