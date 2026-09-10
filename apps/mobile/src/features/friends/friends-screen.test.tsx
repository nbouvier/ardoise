import type { FriendSummary } from '@splitcount/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { FriendsScreen } from './friends-screen';
import { pendingInvite } from './pending-invite';

const ada: FriendSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ada Lovelace',
  picture: null,
};

const mockFetchFriends = jest.fn<() => Promise<FriendSummary[]>>();
const mockRemoveFriend = jest.fn<() => Promise<void>>();
const mockFetchInvite = jest.fn<() => Promise<unknown>>();

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

beforeEach(() => {
  mockFetchFriends.mockReset().mockResolvedValue([]);
  mockRemoveFriend.mockReset().mockResolvedValue(undefined);
  mockFetchInvite.mockReset().mockResolvedValue({
    code: 'Zx3k9QpL2mN7vR1sT4uW8g',
    url: 'https://api.test/i/Zx3k9QpL2mN7vR1sT4uW8g',
    expiresAt: '2026-09-17T12:00:00.000Z',
  });
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
});
