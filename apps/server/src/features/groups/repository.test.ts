import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseHandle } from '../../db/client.js';
import { groupMembers, groups, users, type GroupRow, type UserRow } from '../../db/schema.js';
import { createTestDatabase, resetDatabase } from '../../test/database.js';

import { createGroupsRepository, type GroupsRepository } from './repository.js';

/**
 * These exercise the tree primitives (`docs/specs/groups.md`) directly against
 * the schema's constraints, ahead of any service wiring — nothing here yet
 * creates a sub-group through the repository's own `createGroup`, since
 * assigning a parent is not wired in until the create-a-sub-group behavior
 * lands.
 */
describe('groups repository — tree primitives', () => {
  let handle: DatabaseHandle;
  let repository: GroupsRepository;

  beforeAll(async () => {
    handle = await createTestDatabase();
    repository = createGroupsRepository(handle.db);
  });

  afterAll(async () => {
    await handle.close();
  });

  beforeEach(async () => {
    await resetDatabase(handle);
  });

  async function insertUser(name: string): Promise<UserRow> {
    const [user] = await handle.db
      .insert(users)
      .values({ googleSub: `google-${name}`, email: `${name}@example.com`, name })
      .returning();
    return user!;
  }

  async function insertGroup(values: {
    name: string;
    parentId?: string | null;
    depth?: number;
    kind?: 'standard' | 'pair';
    friendshipId?: string | null;
  }): Promise<GroupRow> {
    const [group] = await handle.db
      .insert(groups)
      .values({
        kind: values.kind ?? 'standard',
        name: values.kind === 'pair' ? null : values.name,
        friendshipId: values.friendshipId ?? null,
        parentId: values.parentId ?? null,
        depth: values.depth ?? 0,
      })
      .returning();
    return group!;
  }

  async function addMember(groupId: string, userId: string, role: 'owner' | 'member' = 'member') {
    await handle.db.insert(groupMembers).values({ groupId, userId, role });
  }

  describe('schema constraints', () => {
    it('rejects a root group with a non-zero depth', async () => {
      await expect(insertGroup({ name: 'Corsica', depth: 1 })).rejects.toThrow();
    });

    it('rejects a sub-group with depth zero', async () => {
      const parent = await insertGroup({ name: 'Corsica' });
      await expect(
        insertGroup({ name: 'Ajaccio', parentId: parent.id, depth: 0 }),
      ).rejects.toThrow();
    });

    it('rejects a depth beyond the five-level cap', async () => {
      const parent = await insertGroup({ name: 'Corsica' });
      await expect(
        insertGroup({ name: 'Too deep', parentId: parent.id, depth: 5 }),
      ).rejects.toThrow();
    });

    it('rejects a pair group with a parent', async () => {
      const parent = await insertGroup({ name: 'Corsica' });
      await expect(
        insertGroup({ name: 'Pair', kind: 'pair', parentId: parent.id, depth: 1 }),
      ).rejects.toThrow();
    });
  });

  describe('listAncestors', () => {
    it('returns nothing for a root group', async () => {
      const root = await insertGroup({ name: 'Corsica' });
      expect(await repository.listAncestors(root.id)).toEqual([]);
    });

    it('returns every ancestor, root first', async () => {
      const root = await insertGroup({ name: 'Corsica' });
      const child = await insertGroup({ name: 'Ajaccio', parentId: root.id, depth: 1 });
      const grandchild = await insertGroup({
        name: 'Beach day',
        parentId: child.id,
        depth: 2,
      });

      const ancestors = await repository.listAncestors(grandchild.id);
      expect(ancestors.map((group) => group.id)).toEqual([root.id, child.id]);
    });

    it('does not cross into a sibling branch', async () => {
      const root = await insertGroup({ name: 'Corsica' });
      const childA = await insertGroup({ name: 'Ajaccio', parentId: root.id, depth: 1 });
      await insertGroup({ name: 'Bastia', parentId: root.id, depth: 1 });

      const ancestors = await repository.listAncestors(childA.id);
      expect(ancestors.map((group) => group.id)).toEqual([root.id]);
    });
  });

  describe('listDescendantIds', () => {
    it('returns nothing for a leaf group', async () => {
      const root = await insertGroup({ name: 'Corsica' });
      expect(await repository.listDescendantIds(root.id)).toEqual([]);
    });

    it('returns every descendant at every depth', async () => {
      const root = await insertGroup({ name: 'Corsica' });
      const childA = await insertGroup({ name: 'Ajaccio', parentId: root.id, depth: 1 });
      const childB = await insertGroup({ name: 'Bastia', parentId: root.id, depth: 1 });
      const grandchild = await insertGroup({
        name: 'Beach day',
        parentId: childA.id,
        depth: 2,
      });

      const descendants = await repository.listDescendantIds(root.id);
      expect(descendants.sort()).toEqual([childA.id, childB.id, grandchild.id].sort());
    });

    it('scopes to the given sub-tree only', async () => {
      const root = await insertGroup({ name: 'Corsica' });
      const childA = await insertGroup({ name: 'Ajaccio', parentId: root.id, depth: 1 });
      await insertGroup({ name: 'Bastia', parentId: root.id, depth: 1 });
      const grandchild = await insertGroup({
        name: 'Beach day',
        parentId: childA.id,
        depth: 2,
      });

      expect(await repository.listDescendantIds(childA.id)).toEqual([grandchild.id]);
    });
  });

  describe('listChildren', () => {
    it('returns nothing for a group with no sub-groups', async () => {
      const root = await insertGroup({ name: 'Corsica' });
      expect(await repository.listChildren(root.id)).toEqual([]);
    });

    it('returns direct sub-groups only, with their member counts', async () => {
      const root = await insertGroup({ name: 'Corsica' });
      const ada = await insertUser('ada');
      const grace = await insertUser('grace');

      const childA = await insertGroup({ name: 'Ajaccio', parentId: root.id, depth: 1 });
      await addMember(childA.id, ada.id, 'owner');
      await addMember(childA.id, grace.id);

      const childB = await insertGroup({ name: 'Bastia', parentId: root.id, depth: 1 });
      await addMember(childB.id, ada.id, 'owner');

      // A grandchild must not appear in the root's direct children.
      const grandchild = await insertGroup({
        name: 'Beach day',
        parentId: childA.id,
        depth: 2,
      });
      await addMember(grandchild.id, ada.id, 'owner');

      const children = await repository.listChildren(root.id);
      expect(children).toEqual(
        expect.arrayContaining([
          { group: expect.objectContaining({ id: childA.id }), memberCount: 2 },
          { group: expect.objectContaining({ id: childB.id }), memberCount: 1 },
        ]),
      );
      expect(children).toHaveLength(2);
    });

    it('counts a sub-group with no members yet as zero rather than dropping it', async () => {
      const root = await insertGroup({ name: 'Corsica' });
      await insertGroup({ name: 'Empty', parentId: root.id, depth: 1 });

      const children = await repository.listChildren(root.id);
      expect(children).toEqual([
        { group: expect.objectContaining({ name: 'Empty' }), memberCount: 0 },
      ]);
    });
  });
});
