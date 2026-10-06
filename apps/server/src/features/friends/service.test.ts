import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseHandle } from '../../db/client.js';
import { friendships, groups, users, type InviteRow, type UserRow } from '../../db/schema.js';
import { createTestDatabase, resetDatabase } from '../../test/database.js';
import { ensurePairGroup } from '../groups/repository.js';
import type { InviteContext } from '../invites/service.js';
import { toUserSummary } from '../users/repository.js';

import { createFriendsRepository } from './repository.js';
import { createFriendInviteHandler } from './service.js';

describe('friend invitation handler', () => {
  let handle: DatabaseHandle;
  let ada: UserRow;
  let bob: UserRow;

  beforeAll(async () => {
    handle = await createTestDatabase();
  });

  afterAll(async () => {
    await handle.close();
  });

  beforeEach(async () => {
    await resetDatabase(handle);
    [ada, bob] = (await handle.db
      .insert(users)
      .values([
        { googleSub: 'sub-ada', email: 'ada@example.com', name: 'Ada', picture: null },
        { googleSub: 'sub-bob', email: 'bob@example.com', name: 'Bob', picture: null },
      ])
      .returning()) as [UserRow, UserRow];
  });

  const invitationFrom = (inviter: UserRow): InviteContext => ({
    invite: { inviterId: inviter.id } as InviteRow,
    inviter: toUserSummary(inviter),
  });

  it('creates the friendship and its pair group together', async () => {
    const handler = createFriendInviteHandler(createFriendsRepository(handle.db), {
      ensure: ensurePairGroup,
    });

    await handler.accept(invitationFrom(ada), bob.id);

    expect(await handle.db.select().from(friendships)).toHaveLength(1);
    expect(await handle.db.select().from(groups)).toHaveLength(1);
  });

  it('leaves no friendship behind when the pair group cannot be created', async () => {
    const handler = createFriendInviteHandler(createFriendsRepository(handle.db), {
      ensure: async () => {
        throw new Error('pair group insert failed');
      },
    });

    await expect(handler.accept(invitationFrom(ada), bob.id)).rejects.toThrow(
      'pair group insert failed',
    );

    expect(await handle.db.select().from(friendships)).toHaveLength(0);
  });
});
