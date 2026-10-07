import { describe, expect, it } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { createTestQueryClient } from '@/test-utils/render';

import { readStatus } from './client';
import { queryKeys } from './keys';
import { useInvalidation } from './use-invalidation';

describe('readStatus', () => {
  const query = (fields: Partial<Parameters<typeof readStatus>[0]>) => ({
    isPending: false,
    isError: false,
    isFetching: false,
    ...fields,
  });

  it('is loading until there is something to show', () => {
    expect(readStatus(query({ isPending: true, isFetching: true }))).toBe('loading');
  });

  it('stays ready while data already shown is refetched', () => {
    expect(readStatus(query({ isFetching: true }))).toBe('ready');
  });

  it('is an error once a read failed, and loading again while it is retried', () => {
    expect(readStatus(query({ isError: true }))).toBe('error');
    expect(readStatus(query({ isError: true, isFetching: true }))).toBe('loading');
  });
});

describe('useInvalidation', () => {
  /** Every cached read, each with something in it, and which went stale after `change`. */
  async function staleAfter(change: keyof ReturnType<typeof useInvalidation>) {
    const queryClient = createTestQueryClient();
    const keys = {
      groupList: queryKeys.groupList,
      favoriteGroups: queryKeys.favoriteGroups,
      group: queryKeys.group('g1'),
      transactions: queryKeys.transactions('g1'),
      statistics: queryKeys.statistics('g1', {
        type: 'spending',
        participantIds: null,
        subgroupIds: null,
        from: null,
        to: null,
      }),
      balances: queryKeys.balances('g1'),
      recentTransactions: queryKeys.recentTransactions,
      friends: queryKeys.friends,
    };
    for (const key of Object.values(keys)) {
      queryClient.setQueryData(key, []);
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = await renderHook(() => useInvalidation(), { wrapper });

    await result.current[change]();

    return Object.entries(keys)
      .filter(([, key]) => queryClient.getQueryState(key)?.isInvalidated)
      .map(([name]) => name)
      .sort();
  }

  it('refreshes what shows groups, friends and statistics included, when a group changes', async () => {
    expect(await staleAfter('groupsChanged')).toEqual(
      ['favoriteGroups', 'friends', 'group', 'groupList', 'recentTransactions', 'statistics'].sort(),
    );
  });

  it('refreshes every figure when a transaction changes', async () => {
    expect(await staleAfter('transactionsChanged')).toEqual(
      [
        'balances',
        'favoriteGroups',
        'friends',
        'group',
        'groupList',
        'recentTransactions',
        'statistics',
        'transactions',
      ].sort(),
    );
  });

  it('refreshes only the friend list when a friendship changes', async () => {
    expect(await staleAfter('friendsChanged')).toEqual(['friends']);
  });
});
