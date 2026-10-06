import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseHandle } from '../../db/client.js';
import { invites, users } from '../../db/schema.js';
import { createTestDatabase, resetDatabase } from '../../test/database.js';
import { createUsersRepository } from '../users/repository.js';

import { createInvitesRepository } from './repository.js';
import { createInvitesService, type InvitesService } from './service.js';

const DAY = 24 * 60 * 60 * 1000;

describe('invitation purge', () => {
  let handle: DatabaseHandle;
  let service: InvitesService;
  let inviterId: string;
  let now: Date;

  beforeAll(async () => {
    handle = await createTestDatabase();
    service = createInvitesService({
      repository: createInvitesRepository(handle.db),
      users: createUsersRepository(handle.db),
      ttlSeconds: 7 * 24 * 60 * 60,
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

  const codes = async () => (await handle.db.select({ code: invites.code }).from(invites)).map((row) => row.code);
  const friend = () => ({ kind: 'friend' as const, inviterId });

  it('deletes invitations expired or revoked over 30 days ago, and keeps the rest', async () => {
    // Created Jan 1st, expired Jan 8th: over 30 days before the purge.
    await service.getOrCreate(friend(), inviterId);
    now = new Date('2026-02-10T00:00:00Z');
    // Created then revoked (by the rotation) on Feb 10th: 5 days before the purge.
    const recentlyRevoked = await service.getOrCreate(friend(), inviterId);
    const live = await service.rotate(friend(), inviterId);
    now = new Date(now.getTime() + 5 * DAY);

    await expect(service.purgeStale()).resolves.toBe(1);

    expect((await codes()).sort()).toEqual([recentlyRevoked.code, live.code].sort());
  });
});
