import type { GroupsRepository } from './repository.js';
import type { GroupBalances } from './service.js';

/**
 * Whether a pair group and every sub-group under it are settled — every
 * balance at zero. Removing the friend deletes that whole tree for both of
 * them, so it is only allowed then: nobody loses a debt they were owed
 * (`docs/specs/friends-and-invitations.md`).
 */
export interface PairTreeSettlement {
  isSettled(userId: string, pairGroupId: string): Promise<boolean>;
}

export function createPairTreeSettlement(
  repository: Pick<GroupsRepository, 'listDescendantIds'>,
  ledger: GroupBalances,
): PairTreeSettlement {
  return {
    async isSettled(userId, pairGroupId) {
      const groupIds = [pairGroupId, ...(await repository.listDescendantIds(pairGroupId))];
      // A pair tree only ever holds the two friends (Others never enters a
      // balance), and a group's balances sum to zero: the caller's own
      // balance at zero means the other's is too.
      const balances = await ledger.balancesByGroup(userId, groupIds);
      return [...balances.values()].every((cents) => cents === 0);
    },
  };
}
