import { EventEmitter } from 'node:events';

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { reportError } from './error-reporting.js';
import { installGracefulShutdown, type ShutdownProcess } from './shutdown.js';

vi.mock('./error-reporting.js', () => ({
  reportError: vi.fn(),
  flushErrorReports: vi.fn(async () => undefined),
}));

/** A stand-in for `process`: `signal()` plays the platform, `exit` records what the server asked for. */
function fakeProcess() {
  const emitter = new EventEmitter();
  const exit = vi.fn();
  const proc: ShutdownProcess = {
    on: (signal, listener) => emitter.on(signal, listener),
    exit,
  };
  return { proc, exit, signal: (name: NodeJS.Signals) => emitter.emit(name, name) };
}

/** A promise settled from the outside, to hold a request open for as long as a test needs. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

describe('installGracefulShutdown', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    // Shutdown normally closed it already; closing twice would wait forever.
    if (app?.server.listening) {
      await app.close();
    }
    app = undefined;
    vi.mocked(reportError).mockClear();
  });

  /**
   * A listening app with one route that answers only when `release` opens.
   * `configure` runs before it starts listening, the last moment hooks can be added.
   */
  async function listeningApp(configure?: (app: FastifyInstance) => void) {
    const release = gate();
    const entered = gate();
    const closed = vi.fn();
    app = Fastify();
    app.addHook('onClose', closed);
    configure?.(app);
    app.get('/slow', async () => {
      entered.open();
      await release.opened;
      return { done: true };
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    const url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    return { app, url, release, entered, closed };
  }

  it.each(['SIGTERM', 'SIGINT'] as const)(
    'closes the app and exits 0 on %s',
    async (name) => {
      const { app, closed } = await listeningApp();
      const { proc, exit, signal } = fakeProcess();
      installGracefulShutdown(app, { timeoutMs: 5_000, process: proc });

      signal(name);

      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
      expect(closed).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledTimes(1);
    },
  );

  it('lets an in-flight request finish before exiting', async () => {
    const { app, url, release, entered } = await listeningApp();
    const { proc, exit, signal } = fakeProcess();
    installGracefulShutdown(app, { timeoutMs: 5_000, process: proc });

    const inFlight = fetch(`${url}/slow`);
    await entered.opened;
    signal('SIGTERM');
    // Shutdown has started but the request is still being served.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exit).not.toHaveBeenCalled();

    release.open();
    const response = await inFlight;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ done: true });
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
  });

  it('stops accepting new connections once shutdown has started', async () => {
    const { app, url, release, entered } = await listeningApp();
    const { proc, signal } = fakeProcess();
    installGracefulShutdown(app, { timeoutMs: 5_000, process: proc });

    const inFlight = fetch(`${url}/slow`);
    await entered.opened;
    signal('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 50));

    await expect(fetch(`${url}/slow`)).rejects.toThrow();

    release.open();
    await inFlight;
  });

  it('gives up and exits 1 when a request outlasts the timeout', async () => {
    const { app, url, release, entered } = await listeningApp();
    const { proc, exit, signal } = fakeProcess();
    installGracefulShutdown(app, { timeoutMs: 100, process: proc });

    const stuck = fetch(`${url}/slow`).catch(() => undefined);
    await entered.opened;
    signal('SIGTERM');

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'server.shutdown.timeout', {
      timeoutMs: 100,
    });

    // The late close must not report a second, contradictory exit.
    release.open();
    await stuck;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('exits 1 when closing fails', async () => {
    const { app } = await listeningApp((instance) => {
      instance.addHook('onClose', async () => {
        await Promise.reject(new Error('pool refused to close'));
      });
    });
    const { proc, exit, signal } = fakeProcess();
    installGracefulShutdown(app, { timeoutMs: 5_000, process: proc });

    signal('SIGTERM');

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'server.shutdown.failed');
  });

  it('sends queued error reports before exiting', async () => {
    const { app } = await listeningApp();
    const { proc, exit, signal } = fakeProcess();
    const sent = gate();
    const flushReports = vi.fn(() => sent.opened);
    installGracefulShutdown(app, { timeoutMs: 5_000, process: proc, flushReports });

    signal('SIGTERM');
    await vi.waitFor(() => expect(flushReports).toHaveBeenCalledTimes(1));
    expect(exit).not.toHaveBeenCalled();

    sent.open();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
  });

  it('ignores a second signal while shutting down', async () => {
    const { app, release, url, entered, closed } = await listeningApp();
    const { proc, exit, signal } = fakeProcess();
    installGracefulShutdown(app, { timeoutMs: 5_000, process: proc });

    const inFlight = fetch(`${url}/slow`);
    await entered.opened;
    signal('SIGTERM');
    signal('SIGINT');
    release.open();
    await inFlight;

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(closed).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
