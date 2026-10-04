import type { FastifyInstance } from 'fastify';

import { flushErrorReports, reportError } from './error-reporting.js';

/** The slice of `process` the shutdown logic touches, so a test can stand in for it. */
export interface ShutdownProcess {
  on: (signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void) => unknown;
  exit: (code: number) => unknown;
}

const SWEEP_INTERVAL_MS = 100;

export interface GracefulShutdownOptions {
  /** How long to wait for in-flight requests before giving up and exiting 1. */
  timeoutMs: number;
  signals?: NodeJS.Signals[] | undefined;
  process?: ShutdownProcess | undefined;
  /** Sends queued error reports before the exit. Default: `flushErrorReports`. */
  flushReports?: (() => Promise<void>) | undefined;
}

/**
 * Stop cleanly when the platform asks the process to: on `SIGTERM` (a deploy,
 * a scale-down, a container stop) or `SIGINT` (Ctrl+C), stop accepting
 * connections, let in-flight requests finish, close the database pool, and exit
 * `0`. Without it the process is killed mid-request when the orchestrator's
 * grace period ends.
 *
 * `app.close()` does the work: it stops the listener, answers requests that
 * arrive on already-open keep-alive connections with a `503`, closes idle
 * connections, waits for the in-flight ones, then runs the `onClose` hooks
 * (which is where the database handle is released).
 *
 * One thing it does not do: a keep-alive connection whose request is still in
 * flight when shutdown starts is not idle yet, so it is not closed — and once
 * the response is out it would stay open for Fastify's 72s keep-alive timeout,
 * holding `close()` (and so the exit) hostage. The load balancer's connections
 * are exactly that. So while closing, idle connections are swept every
 * `SWEEP_INTERVAL_MS`: each one is closed as soon as its last response is sent.
 *
 * If that takes longer than `timeoutMs` — a request that never ends — the
 * process exits `1` anyway: a deployment that hangs is worse than one request
 * cut short. Keep `timeoutMs` below the platform's kill timeout so this log
 * line, not a `SIGKILL`, is what explains the exit.
 *
 * A second signal while shutting down is ignored. Before exiting, whatever the
 * outcome, queued error reports are sent (a couple of seconds at most), so the
 * failures that led to the exit, the exit's own included, are not lost with it.
 */
export function installGracefulShutdown(
  app: FastifyInstance,
  options: GracefulShutdownOptions,
): void {
  const proc = options.process ?? process;
  const signals = options.signals ?? ['SIGTERM', 'SIGINT'];
  const flushReports = options.flushReports ?? (() => flushErrorReports());
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    app.log.info({ signal, timeoutMs: options.timeoutMs }, 'server.shutdown.started');

    let exited = false;
    const exit = async (code: number): Promise<void> => {
      if (!exited) {
        exited = true;
        clearTimeout(deadline);
        clearInterval(sweeper);
        await flushReports();
        proc.exit(code);
      }
    };
    const sweeper = setInterval(() => app.server.closeIdleConnections(), SWEEP_INTERVAL_MS);
    const deadline = setTimeout(() => {
      app.log.error({ timeoutMs: options.timeoutMs }, 'server.shutdown.timeout');
      reportError(new Error('Shutdown timed out'), 'server.shutdown.timeout', {
        timeoutMs: options.timeoutMs,
      });
      void exit(1);
    }, options.timeoutMs);

    try {
      await app.close();
      app.log.info('server.shutdown.completed');
      await exit(0);
    } catch (error) {
      app.log.error(error, 'server.shutdown.failed');
      reportError(error, 'server.shutdown.failed');
      await exit(1);
    }
  };

  for (const signal of signals) {
    proc.on(signal, (received) => void shutdown(received));
  }
}
