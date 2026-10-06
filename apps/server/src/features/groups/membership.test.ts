import { describe, expect, it } from 'vitest';

import type { GroupRow } from '../../db/schema.js';

import {
  assertActive,
  assertCanLeave,
  assertNotPairGroup,
  assertOwner,
  assertCanRemoveOthers,
  assertRemovable,
  GroupAccessError,
} from './membership.js';

const now = new Date('2026-09-11T12:00:00.000Z');

function group(overrides: Partial<GroupRow> = {}): GroupRow {
  return {
    id: 'group-1',
    kind: 'standard',
    name: 'Corsica',
    friendshipId: null,
    parentId: null,
    depth: 0,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const pairGroup = group({ kind: 'pair', name: null, friendshipId: 'friendship-1' });

describe('assertNotPairGroup', () => {
  it('allows a standard group', () => {
    expect(() => assertNotPairGroup(group())).not.toThrow();
  });

  it('refuses a pair group, archived or not', () => {
    for (const candidate of [pairGroup, { ...pairGroup, archivedAt: now }]) {
      expect(() => assertNotPairGroup(candidate)).toThrow(
        expect.objectContaining({ reason: 'pair_immutable' }),
      );
    }
  });
});

describe('assertActive', () => {
  it('allows an active group', () => {
    expect(() => assertActive(group())).not.toThrow();
  });

  it('refuses an archived group', () => {
    expect(() => assertActive(group({ archivedAt: now }))).toThrow(
      expect.objectContaining({ reason: 'archived' }),
    );
  });
});

describe('assertOwner', () => {
  it('allows the owner', () => {
    expect(() => assertOwner('owner')).not.toThrow();
  });

  it('refuses a plain member', () => {
    expect(() => assertOwner('member')).toThrow(
      expect.objectContaining({ reason: 'not_owner' }),
    );
  });
});

describe('assertCanLeave', () => {
  it('lets a member leave whatever the size of the group', () => {
    expect(() => assertCanLeave('member', 5)).not.toThrow();
  });

  it('refuses an owner who would strand the others', () => {
    expect(() => assertCanLeave('owner', 2)).toThrow(GroupAccessError);
    expect(() => assertCanLeave('owner', 2)).toThrow(
      expect.objectContaining({ reason: 'owner_cannot_leave' }),
    );
  });

  it('lets the last member leave, which deletes the group', () => {
    expect(() => assertCanLeave('owner', 1)).not.toThrow();
  });
});

describe('assertCanRemoveOthers', () => {
  it('lets the owner remove someone else', () => {
    expect(() => assertCanRemoveOthers('owner')).not.toThrow();
  });

  it('refuses a member', () => {
    expect(() => assertCanRemoveOthers('member')).toThrow(
      expect.objectContaining({ reason: 'not_owner' }),
    );
  });
});

describe('assertRemovable', () => {
  it('lets a member be removed', () => {
    expect(() => assertRemovable('member')).not.toThrow();
  });

  it('protects the owner, who alone can delete the group', () => {
    expect(() => assertRemovable('owner')).toThrow(
      expect.objectContaining({ reason: 'cannot_remove_owner' }),
    );
  });
});
