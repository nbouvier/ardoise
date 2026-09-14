import type { GroupSummary, RecentTransaction } from '@splitcount/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { groupsChanged } from '@/features/groups/groups-changed';
import { transactionsChanged } from '@/features/transactions/transactions-changed';
import { ada, groupSummary, transaction } from '@/test-utils/api-fakes';

import { HomeScreen } from './home-screen';

const trip: GroupSummary = { ...groupSummary, favorite: true };

const beachDay: GroupSummary = {
  ...groupSummary,
  id: '77777777-7777-4777-8777-777777777777',
  name: 'Beach day',
  parentId: trip.id,
  depth: 1,
  ancestors: [{ id: trip.id, name: 'Corsica 2026' }],
  favorite: true,
};

const entry: RecentTransaction = {
  transaction,
  group: { id: trip.id, name: 'Corsica 2026', ancestors: [] },
};

const nested: RecentTransaction = {
  transaction: {
    ...transaction,
    id: '88888888-8888-4888-8888-888888888888',
    groupId: beachDay.id,
    title: 'Parasol',
  },
  group: { id: beachDay.id, name: 'Beach day', ancestors: beachDay.ancestors },
};

const mockFetchFavoriteGroups = jest.fn<() => Promise<GroupSummary[]>>();
const mockFetchRecent = jest.fn<() => Promise<RecentTransaction[]>>();
const mockSetGroupFavorite = jest.fn<(...args: unknown[]) => Promise<GroupSummary>>();
const mockPush = jest.fn();

// Stable across renders, like the real memoised auth context.
const mockAuthContext = {
  authorizedFetch: jest.fn(),
  state: { status: 'signedIn', user: ada },
};

jest.mock('@/features/auth/use-auth', () => ({
  useAuth: () => mockAuthContext,
}));

jest.mock('@/lib/api/groups', () => ({
  fetchFavoriteGroups: () => mockFetchFavoriteGroups(),
  setGroupFavorite: (...args: unknown[]) => mockSetGroupFavorite(...args),
}));

jest.mock('@/lib/api/transactions', () => ({
  fetchRecentTransactions: () => mockFetchRecent(),
}));

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => {
  mockFetchFavoriteGroups.mockReset().mockResolvedValue([]);
  mockFetchRecent.mockReset().mockResolvedValue([]);
  mockSetGroupFavorite.mockReset().mockResolvedValue({ ...trip, favorite: false });
  mockPush.mockReset();
});

describe('HomeScreen', () => {
  it('leads with the app’s own identity', async () => {
    await render(<HomeScreen />);

    expect(await screen.findByText('SplitCount')).toBeTruthy();
    expect(screen.getByText('Settle up, stay friends.')).toBeTruthy();
  });

  it('explains each section when there is nothing in it', async () => {
    await render(<HomeScreen />);

    expect(await screen.findByText(/Star a group/)).toBeTruthy();
    expect(screen.getByText(/Transactions you’re part of/)).toBeTruthy();
  });

  it('lists favorited groups of every kind, with their balance', async () => {
    const pair: GroupSummary = {
      ...groupSummary,
      id: '99999999-9999-4999-8999-999999999999',
      kind: 'pair',
      name: 'Grace',
      favorite: true,
      viewerBalanceCents: -1500,
    };
    mockFetchFavoriteGroups.mockResolvedValue([trip, beachDay, pair]);

    await render(<HomeScreen />);

    // Twice: the trip's own row, and the breadcrumb above its sub-group's.
    expect(await screen.findAllByText('Corsica 2026')).toHaveLength(2);
    expect(screen.getByText('Beach day')).toBeTruthy();
    expect(screen.getByText('Grace')).toBeTruthy();
    expect(screen.getByText('You owe 15.00')).toBeTruthy();
  });

  it('opens a favorited group when its row is tapped', async () => {
    mockFetchFavoriteGroups.mockResolvedValue([trip]);

    await render(<HomeScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Corsica 2026' }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/groups/[id]',
      params: { id: trip.id },
    });
  });

  it('takes a group out of the section when its star is tapped', async () => {
    mockFetchFavoriteGroups.mockResolvedValue([trip]);

    await render(<HomeScreen />);
    await screen.findByText('Corsica 2026');

    // The refetch the toggle triggers has nothing left to return.
    mockFetchFavoriteGroups.mockResolvedValue([]);
    await fireEvent.press(
      screen.getByRole('button', { name: /Remove Corsica 2026 from favorites/i }),
    );

    expect(mockSetGroupFavorite).toHaveBeenCalledWith(expect.anything(), trip.id, false);
    await waitFor(() => expect(screen.queryByText('Corsica 2026')).toBeNull());
  });

  it('lists the latest transactions with the group each happened in', async () => {
    mockFetchRecent.mockResolvedValue([entry, nested]);

    await render(<HomeScreen />);

    expect(await screen.findByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Parasol')).toBeTruthy();
    // The nested one reads as its whole trail, the root one as itself.
    expect(screen.getAllByText('Corsica 2026').length).toBeGreaterThan(0);
    expect(screen.getByText('Beach day')).toBeTruthy();
  });

  it('opens the group a transaction belongs to, not the transaction', async () => {
    mockFetchRecent.mockResolvedValue([nested]);

    await render(<HomeScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Parasol' }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/groups/[id]',
      params: { id: beachDay.id },
    });
  });

  it('re-reads the latest list when a transaction changes elsewhere', async () => {
    await render(<HomeScreen />);
    await screen.findByText(/Transactions you’re part of/);

    mockFetchRecent.mockResolvedValue([entry]);
    await act(async () => transactionsChanged.notify());

    expect(await screen.findByText('Groceries')).toBeTruthy();
  });

  it('re-reads the favorites when a group changes elsewhere', async () => {
    await render(<HomeScreen />);
    await screen.findByText(/Star a group/);

    mockFetchFavoriteGroups.mockResolvedValue([trip]);
    await act(async () => groupsChanged.notify());

    expect(await screen.findByText('Corsica 2026')).toBeTruthy();
  });

  it('reloads both sections on pull to refresh, and not on mount', async () => {
    await render(<HomeScreen />);
    await screen.findByText(/Star a group/);

    expect(mockFetchFavoriteGroups).toHaveBeenCalledTimes(1);
    expect(mockFetchRecent).toHaveBeenCalledTimes(1);
    // `RefreshControl` is a prop of the scroll view rather than a child of
    // it, so the gesture is read and fired through that prop.
    const control = () => screen.getByTestId('home-scroll').props.refreshControl.props;
    // The gesture's own spinner is not what a first load shows.
    expect(control().refreshing).toBe(false);

    await act(async () => control().onRefresh());

    expect(mockFetchFavoriteGroups).toHaveBeenCalledTimes(2);
    expect(mockFetchRecent).toHaveBeenCalledTimes(2);
    // And it stops spinning once the slower of the two lands.
    await waitFor(() => expect(control().refreshing).toBe(false));
  });

  it('lets one section fail and retry without taking the other down', async () => {
    mockFetchFavoriteGroups.mockRejectedValue(new Error('offline'));
    mockFetchRecent.mockResolvedValue([entry]);

    await render(<HomeScreen />);

    expect(await screen.findByText(/couldn’t load your favorites/)).toBeTruthy();
    // The other section, and the identity, are untouched.
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('SplitCount')).toBeTruthy();

    mockFetchFavoriteGroups.mockResolvedValue([trip]);
    await fireEvent.press(screen.getByRole('button', { name: /try again/i }));

    // Its own row, alongside the one already naming it above a transaction.
    expect(await screen.findByRole('button', { name: 'Corsica 2026' })).toBeTruthy();
  });
});
