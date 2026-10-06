import type { TransactionsListScope } from '@ardoise/shared';

/**
 * Every cached read, by key. Grouped under three roots so a change can
 * invalidate everything it affects by prefix (`useInvalidation`): `groups`
 * (what a group is and who is in it), `ledger` (transactions, and every
 * figure derived from them) and `friends`.
 */
export const queryKeys = {
  groups: ['groups'] as const,
  groupList: ['groups', 'list'] as const,
  favoriteGroups: ['groups', 'favorites'] as const,
  group: (groupId: string) => ['groups', 'detail', groupId] as const,

  ledger: ['ledger'] as const,
  transactions: (groupId: string, scope: TransactionsListScope, subgroupIdsKey?: string) =>
    ['ledger', 'transactions', groupId, scope, subgroupIdsKey ?? null] as const,
  balances: (groupId: string) => ['ledger', 'balances', groupId] as const,
  recentTransactions: ['ledger', 'recent'] as const,

  friends: ['friends'] as const,

  invite: (target: string) => ['invite', target] as const,
};
