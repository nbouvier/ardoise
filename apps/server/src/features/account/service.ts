import type { AccountDeletionPreview } from '@ardoise/shared';

import type { AccountRepository, DeletionSummary } from './repository.js';

/**
 * The slice of the ledger the deletion preview needs: the user's own balance
 * in each of their groups. Read from `transactions`' repository, the same
 * narrow pattern `groups` and `friends` use.
 */
export interface AccountBalances {
  balancesByGroup(userId: string, groupIds: readonly string[]): Promise<Map<string, number>>;
}

export interface AccountService {
  /** What the Delete account page shows before anything is deleted. */
  deletionPreview(userId: string): Promise<AccountDeletionPreview>;
  /** Delete the account; `null` when it does not exist (already deleted). */
  deleteAccount(userId: string): Promise<DeletionSummary | null>;
}

export interface AccountServiceDeps {
  repository: AccountRepository;
  ledger: AccountBalances;
}

export function createAccountService({ repository, ledger }: AccountServiceDeps): AccountService {
  return {
    async deletionPreview(userId) {
      const [memberships, friendCount] = await Promise.all([
        repository.listMembershipGroups(userId),
        repository.countFriendships(userId),
      ]);
      const balances = await ledger.balancesByGroup(
        userId,
        memberships.map((group) => group.groupId),
      );

      return {
        friendCount,
        balances: memberships
          .map((group) => ({ ...group, balanceCents: balances.get(group.groupId) ?? 0 }))
          .filter((group) => group.balanceCents !== 0)
          // What the user is owed first: that is what they lose.
          .sort((a, b) => b.balanceCents - a.balanceCents || a.name.localeCompare(b.name)),
      };
    },

    deleteAccount(userId) {
      return repository.deleteAccount(userId);
    },
  };
}
