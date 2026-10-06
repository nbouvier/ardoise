import { and, eq, gt, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseHandle } from '../../db/client.js';
import { invites, users } from '../../db/schema.js';
import { createTestDatabase, resetDatabase } from '../../test/database.js';
import { createUsersRepository } from '../users/repository.js';

import { createInvitesRepository } from './repository.js';
import { createInvitesService, type InvitesService } from './service.js';

describe('invites service', () => {
  let handle: DatabaseHandle;
  let service: InvitesService;
  let inviterId: string;
  let now = new Date('2026-01-01T00:00:00Z');

  beforeAll(async () => {
    handle = await createTestDatabase();
    service = createInvitesService({
      repository: createInvitesRepository(handle.db),
      users: createUsersRepository(handle.db),
      ttlSeconds: 60,
      publicBaseUrl: 'https://ardoise.test',
      now: () => now,
    });
  });

  afterAll(async () => {
    await handle.close();
  });

  beforeEach(async () => {
    await resetDatabase(handle);
    now = new Date('2026-01-01T00:00:00Z');
    const [user] = await handle.db
      .insert(users)
      .values({ googleSub: 'sub-ada', email: 'ada@example.com', name: 'Ada', picture: null })
      .returning();
    inviterId = user!.id;
  });

  const target = () => ({ kind: 'friend' as const, inviterId });

  async function activeCodes(): Promise<string[]> {
    const rows = await handle.db
      .select({ code: invites.code })
      .from(invites)
      .where(
        and(eq(invites.inviterId, inviterId), isNull(invites.revokedAt), gt(invites.expiresAt, now)),
      );
    return rows.map((row) => row.code);
  }

  it('gives two concurrent first requests the same invitation', async () => {
    const [first, second] = await Promise.all([
      service.getOrCreate(target(), inviterId),
      service.getOrCreate(target(), inviterId),
    ]);

    expect(second.code).toBe(first.code);
    expect(await activeCodes()).toEqual([first.code]);
  });

  it('leaves a single active invitation after two concurrent rotations', async () => {
    await service.getOrCreate(target(), inviterId);

    await Promise.all([service.rotate(target(), inviterId), service.rotate(target(), inviterId)]);

    expect(await activeCodes()).toHaveLength(1);
  });

  it('replaces an expired invitation with a new one', async () => {
    const expired = await service.getOrCreate(target(), inviterId);
    now = new Date('2026-01-01T00:02:00Z');

    const fresh = await service.getOrCreate(target(), inviterId);

    expect(fresh.code).not.toBe(expired.code);
    expect(await activeCodes()).toEqual([fresh.code]);
  });
});
