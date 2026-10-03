import pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { attachPoolErrorHandler } from './client.js';

describe('attachPoolErrorHandler', () => {
  // `new pg.Pool` opens no connection until it is queried, so no database is needed.
  let pool: pg.Pool;

  afterEach(async () => {
    await pool.end();
  });

  it('keeps the process alive when an idle client errors, as happens when Postgres restarts', () => {
    pool = new pg.Pool();
    attachPoolErrorHandler(pool, vi.fn());

    // Without a listener, emitting 'error' throws: in production that is an
    // uncaught exception raised from a socket callback, and the process dies.
    expect(() => pool.emit('error', new Error('terminating connection'))).not.toThrow();
  });

  it('reports the error so the failure is diagnosable', () => {
    pool = new pg.Pool();
    const onError = vi.fn();
    attachPoolErrorHandler(pool, onError);
    const error = Object.assign(new Error('terminating connection due to administrator command'), {
      code: '57P01',
    });

    pool.emit('error', error);

    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
  });
});
