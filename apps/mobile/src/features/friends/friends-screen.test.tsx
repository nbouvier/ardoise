import type { FriendEntry } from '@splitcount/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { pendingInvite } from '@/features/invites/pending-invite';

import { FriendsScreen } from './friends-screen';

const ada: FriendEntry = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ada Lovelace',
  picture: null,
  balanceCents: 0,
};

const mockFetchFriends = jest.fn<() => Promise<FriendEntry[]>>();
const mockRemoveFriend = jest.fn<() => Promise<void>>();
const mockFetchInvite = jest.fn<() => Promise<unknown>>();
const mockFetchPairGroup = jest.fn<() => Promise<{ id: string }>>();
const mockPush = jest.fn();

// Stable across renders, like the real memoised auth context.
const mockAuthContext = { authorizedFetch: jest.fn() };

jest.mock('@/features/auth/use-auth', () => ({
  useAuth: () => mockAuthContext,
}));

jest.mock('@/lib/api/friends', () => ({
  fetchFriends: () => mockFetchFriends(),
  removeFriend: () => mockRemoveFriend(),
  fetchInvite: () => mockFetchInvite(),
  rotateInvite: jest.fn(),
}));

jest.mock('@/lib/api/groups', () => ({
  fetchPairGroup: () => mockFetchPairGroup(),
}));

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => {
  mockFetchFriends.mockReset().mockResolvedValue([]);
  mockRemoveFriend.mockReset().mockResolvedValue(undefined);
  mockFetchInvite.mockReset().mockResolvedValue({
    code: 'Zx3k9QpL2mN7vR1sT4uW8g',
    url: 'https://api.test/i/Zx3k9QpL2mN7vR1sT4uW8g',
    expiresAt: '2026-09-17T12:00:00.000Z',
  });
  mockFetchPairGroup.mockReset().mockResolvedValue({ id: 'group-1' });
  mockPush.mockReset();
  pendingInvite.clear();
});

describe('FriendsScreen', () => {
  it('explains the empty state', async () => {
    await render(<FriendsScreen />);

    expect(await screen.findByText('No friends yet')).toBeTruthy();
  });

  it('lists the friends returned by the server', async () => {
    mockFetchFriends.mockResolvedValue([ada]);

    await render(<FriendsScreen />);

    expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
    expect(screen.queryByText('No friends yet')).toBeNull();
  });

  it('says what a friend owes the viewer', async () => {
    mockFetchFriends.mockResolvedValue([{ ...ada, balanceCents: 1250 }]);

    await render(<FriendsScreen />);

    expect(await screen.findByText('owes you 12.50')).toBeTruthy();
  });

  it('says what the viewer owes a friend, without relying on a minus sign', async () => {
    mockFetchFriends.mockResolvedValue([{ ...ada, balanceCents: -1250 }]);

    await render(<FriendsScreen />);

    expect(await screen.findByText('you owe 12.50')).toBeTruthy();
  });

  it('reads a friend with no shared transaction as settled', async () => {
    mockFetchFriends.mockResolvedValue([{ ...ada, balanceCents: 0 }]);

    await render(<FriendsScreen />);

    expect(await screen.findByText('settled up')).toBeTruthy();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    mockFetchFriends.mockRejectedValueOnce(new Error('offline'));

    await render(<FriendsScreen />);

    expect(await screen.findByText(/couldn’t load your friends/)).toBeTruthy();

    mockFetchFriends.mockResolvedValueOnce([ada]);
    await fireEvent.press(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
  });

  it('hands a manually typed code to the pending-invite store', async () => {
    await render(<FriendsScreen />);
    await screen.findByText('No friends yet');

    await fireEvent.changeText(
      screen.getByLabelText('Invitation code'),
      'Zx3k9QpL2mN7vR1sT4uW8g',
    );
    await fireEvent.press(screen.getByRole('button', { name: /^open$/i }));

    expect(pendingInvite.getSnapshot()).toBe('Zx3k9QpL2mN7vR1sT4uW8g');
  });

  it('opens the invite sheet', async () => {
    await render(<FriendsScreen />);
    await screen.findByText('No friends yet');

    await fireEvent.press(screen.getByRole('button', { name: /invite a friend/i }));

    expect(await screen.findByText(/Send this link/)).toBeTruthy();
  });

  it('opens the group shared with a friend when their row is tapped', async () => {
    mockFetchFriends.mockResolvedValue([ada]);
    await render(<FriendsScreen />);
    await screen.findByText('Ada Lovelace');

    await fireEvent.press(
      screen.getByRole('button', { name: /open your shared group with Ada Lovelace/i }),
    );

    expect(mockFetchPairGroup).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/groups/[id]',
      params: { id: 'group-1' },
    });
  });
});
