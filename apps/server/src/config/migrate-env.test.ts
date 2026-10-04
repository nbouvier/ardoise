import { describe, expect, it } from 'vitest';

import { loadMigrateEnv } from './migrate-env.js';

describe('loadMigrateEnv', () => {
  it('needs only the database URL', () => {
    expect(loadMigrateEnv({ DATABASE_URL: 'postgres://u:p@db:5432/splitcount' })).toEqual({
      DATABASE_URL: 'postgres://u:p@db:5432/splitcount',
      LOG_LEVEL: 'info',
    });
  });

  it('rejects a missing database URL, naming it', () => {
    expect(() => loadMigrateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a malformed database URL', () => {
    expect(() => loadMigrateEnv({ DATABASE_URL: 'not a url' })).toThrow(/DATABASE_URL/);
  });
});
