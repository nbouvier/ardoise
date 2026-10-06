import type { FastifyInstance } from 'fastify';

import { reportError } from './error-reporting.js';

export interface PeriodicTask {
  /** Log event prefix, e.g. `auth.sessions.purge`. */
  name: string;
  intervalMs: number;
  /** The work; resolves to how many rows it touched, logged when not zero. */
  run: () => Promise<number>;
}

/**
 * Run housekeeping once the app is ready, then every `intervalMs` until it
 * closes. Meant for idempotent clean-ups (deleting expired rows): with several
 * instances each runs its own, which is harmless. A failure is logged and
 * reported, and the next run tries again.
 */
export function schedulePeriodicTask(app: FastifyInstance, task: PeriodicTask): void {
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> | undefined;

  async function runOnce(): Promise<void> {
    try {
      const count = await task.run();
      if (count > 0) {
        app.log.info({ count }, `${task.name}.done`);
      }
    } catch (error) {
      const { name, message } = error instanceof Error ? error : new Error(String(error));
      // Plain object, not the error itself: see `http.request.failed` in docs/LOGGING.md.
      app.log.error({ error: { type: name, message } }, `${task.name}.failed`);
      reportError(error, `${task.name}.failed`);
    }
  }

  function tick(): void {
    // Never two at once: a slow run is not stacked behind by the next tick.
    running ??= runOnce().finally(() => {
      running = undefined;
    });
  }

  app.addHook('onReady', async () => {
    tick();
    // Does not keep the process alive on its own: shutdown is `app.close()`.
    timer = setInterval(tick, task.intervalMs).unref();
  });

  app.addHook('onClose', async () => {
    clearInterval(timer);
    // Let a run in progress finish before the database plugin closes its handle.
    await running;
  });
}
