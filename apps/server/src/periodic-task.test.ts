import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { schedulePeriodicTask } from './periodic-task.js';

vi.mock('./error-reporting.js', () => ({ reportError: vi.fn() }));

describe('schedulePeriodicTask', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs once ready, then on every interval, and stops on close', async () => {
    const app = Fastify();
    const run = vi.fn(async () => 0);
    schedulePeriodicTask(app, { name: 'test.task', intervalMs: 1000, run });

    await app.ready();
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(3);

    await app.close();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('keeps running after a failed run', async () => {
    const app = Fastify();
    const run = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(0);
    schedulePeriodicTask(app, { name: 'test.task', intervalMs: 1000, run });

    await app.ready();
    await vi.advanceTimersByTimeAsync(1000);

    expect(run).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it('does not start a run while the previous one is still going', async () => {
    const app = Fastify();
    let finish: (count: number) => void = () => {};
    const run = vi.fn(() => new Promise<number>((resolve) => (finish = resolve)));
    schedulePeriodicTask(app, { name: 'test.task', intervalMs: 1000, run });

    await app.ready();
    await vi.advanceTimersByTimeAsync(3000);
    expect(run).toHaveBeenCalledTimes(1);

    finish(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    finish(0);
    await app.close();
  });
});
