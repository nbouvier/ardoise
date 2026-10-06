import type { StatisticsFilter } from '@/lib/api/transactions';

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
  transactions: (groupId: string) => ['ledger', 'transactions', groupId] as const,
  /** Every breakdown: they also move with the groups in scope, not only with the ledger. */
  allStatistics: ['ledger', 'statistics'] as const,
  statistics: (groupId: string, filter: StatisticsFilter) =>
    ['ledger', 'statistics', groupId, filter] as const,
  balances: (groupId: string) => ['ledger', 'balances', groupId] as const,
  recentTransactions: ['ledger', 'recent'] as const,

  friends: ['friends'] as const,

  invite: (target: string) => ['invite', target] as const,
};
