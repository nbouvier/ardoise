import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestDatabase } from '../../test/database.js';
import type { DatabaseHandle } from '../../db/client.js';
import { sessions, users } from '../../db/schema.js';

import { createAuthRepository, type AuthRepository } from './repository.js';
import { createSessionService, hashRefreshToken, SessionError } from './sessions.js';

describe('session service', () => {
  let handle: DatabaseHandle;
  let repository: AuthRepository;
  let userId: string;

  beforeAll(async () => {
    handle = await createTestDatabase();
    repository = createAuthRepository(handle.db);
  });

  afterAll(async () => {
    await handle.close();
  });

  beforeEach(async () => {
    await handle.db.delete(sessions);
    await handle.db.delete(users);
    const user = await repository.upsertUserByGoogleSub({
      googleSub: 'sub-1',
      email: 'ada@example.com',
      name: 'Ada',
      picture: null,
    });
    userId = user.id;
  });

  it('creates a session persisted only as a hash', async () => {
    const service = createSessionService(repository);

    const { refreshToken } = await service.create(userId);

    const stored = await repository.findSessionByHash(hashRefreshToken(refreshToken));
    expect(stored?.userId).toBe(userId);
    expect(stored?.refreshTokenHash).not.toContain(refreshToken);
  });

  it('rotates a session, revoking the previous token', async () => {
    const service = createSessionService(repository);
    const first = await service.create(userId);

    const rotated = await service.rotate(first.refreshToken);

    expect(rotated.userId).toBe(userId);
    expect(rotated.refreshToken).not.toBe(first.refreshToken);
    await expect(service.rotate(first.refreshToken)).rejects.toMatchObject({
      reason: 'revoked',
    });
    await expect(service.rotate(rotated.refreshToken)).resolves.toBeDefined();
  });

  it('rejects an unknown refresh token', async () => {
    const service = createSessionService(repository);

    await expect(service.rotate('nope')).rejects.toMatchObject({ reason: 'not_found' });
  });

  it('rejects an expired refresh token', async () => {
    let now = new Date('2026-01-01T00:00:00Z');
    const service = createSessionService(repository, 60, () => now);
    const { refreshToken } = await service.create(userId);

    now = new Date('2026-01-01T00:02:00Z');

    await expect(service.rotate(refreshToken)).rejects.toMatchObject({ reason: 'expired' });
  });

  it('revokes a session so it can no longer be rotated', async () => {
    const service = createSessionService(repository);
    const { refreshToken } = await service.create(userId);

    await service.revoke(refreshToken);

    await expect(service.rotate(refreshToken)).rejects.toBeInstanceOf(SessionError);
  });
});
