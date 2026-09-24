import type { FriendEntry } from '@splitcount/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { groupsChanged } from '@/features/groups/groups-changed';
import { pendingInvite } from '@/features/invites/pending-invite';

import { FriendsScreen } from './friends-screen';

const ada: FriendEntry = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ada Lovelace',
  picture: null,
  balanceCents: 0,
  groupId: '99999999-9999-4999-8999-999999999999',
  favorite: false,
};

const mockFetchFriends = jest.fn<() => Promise<FriendEntry[]>>();
const mockRemoveFriend = jest.fn<() => Promise<void>>();
const mockFetchInvite = jest.fn<() => Promise<unknown>>();
const mockSetGroupFavorite = jest.fn<(...args: unknown[]) => Promise<unknown>>();
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
  setGroupFavorite: (...args: unknown[]) => mockSetGroupFavorite(...args),
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
  mockSetGroupFavorite.mockReset().mockResolvedValue({});
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

    await fireEvent.press(screen.getByRole('button', { name: 'Add a friend' }));
    await fireEvent.press(screen.getByText('Enter a code'));

    await fireEvent.changeText(
      screen.getByLabelText('Invitation code'),
      'Zx3k9QpL2mN7vR1sT4uW8g',
    );
    await fireEvent.press(screen.getByRole('button', { name: /^open$/i }));

    expect(pendingInvite.getSnapshot()).toBe('Zx3k9QpL2mN7vR1sT4uW8g');
  });

  it('opens the invite sheet from the add menu', async () => {
    await render(<FriendsScreen />);
    await screen.findByText('No friends yet');

    await fireEvent.press(screen.getByRole('button', { name: 'Add a friend' }));
    await fireEvent.press(screen.getByText('Invite a friend'));

    expect(await screen.findByText(/Send this link/)).toBeTruthy();
  });

  it('opens the group shared with a friend when their row is tapped', async () => {
    mockFetchFriends.mockResolvedValue([ada]);
    await render(<FriendsScreen />);
    await screen.findByText('Ada Lovelace');

    await fireEvent.press(
      screen.getByRole('button', { name: /open your shared group with Ada Lovelace/i }),
    );

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/groups/[id]',
      params: { id: ada.groupId },
    });
  });

  it('offers Manage and Delete friend in the row’s actions menu', async () => {
    mockFetchFriends.mockResolvedValue([ada]);
    await render(<FriendsScreen />);
    await screen.findByText('Ada Lovelace');

    await fireEvent.press(screen.getByRole('button', { name: 'Actions for Ada Lovelace' }));

    expect(screen.getByText('Manage')).toBeTruthy();
    expect(screen.getByText('Delete friend')).toBeTruthy();
  });

  it('opens the shared group’s details from Manage', async () => {
    mockFetchFriends.mockResolvedValue([ada]);
    await render(<FriendsScreen />);
    await screen.findByText('Ada Lovelace');

    await fireEvent.press(screen.getByRole('button', { name: 'Actions for Ada Lovelace' }));
    await fireEvent.press(screen.getByText('Manage'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/groups/[id]',
      params: { id: ada.groupId, openSheet: 'details' },
    });
  });

  it('removes the friend once Delete friend is confirmed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    mockFetchFriends.mockResolvedValue([ada]);
    await render(<FriendsScreen />);
    await screen.findByText('Ada Lovelace');

    await fireEvent.press(screen.getByRole('button', { name: 'Actions for Ada Lovelace' }));
    await fireEvent.press(screen.getByText('Delete friend'));

    expect(alert).toHaveBeenCalledWith('Delete friend', expect.any(String), expect.any(Array));
    await waitFor(() => expect(mockRemoveFriend).toHaveBeenCalledTimes(1));
    alert.mockRestore();
  });

  it('toggles a friend’s favorite from their row', async () => {
    // The mutation's own response applies immediately; the follow-up
    // `groupsChanged`-triggered refetch must agree with it, not clobber it.
    mockFetchFriends.mockResolvedValueOnce([ada]).mockResolvedValue([{ ...ada, favorite: true }]);

    await render(<FriendsScreen />);
    await screen.findByText('Ada Lovelace');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Add Ada Lovelace to favorites' }),
    );

    expect(mockSetGroupFavorite).toHaveBeenCalledWith(expect.anything(), ada.groupId, true);
    expect(
      await screen.findByRole('button', { name: 'Remove Ada Lovelace from favorites' }),
    ).toBeTruthy();
  });

  it('does not reorder the list the instant a friend is favorited from their row', async () => {
    const alan = { ...ada, id: 'alan-id', name: 'Alan Turing', groupId: 'alan-group' };
    const grace = { ...ada, id: 'grace-id', name: 'Grace Hopper', groupId: 'grace-group' };
    mockFetchFriends
      .mockResolvedValueOnce([alan, grace])
      .mockResolvedValue([alan, { ...grace, favorite: true }]);

    await render(<FriendsScreen />);
    await screen.findByText('Alan Turing');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Add Grace Hopper to favorites' }),
    );

    await screen.findByRole('button', { name: 'Remove Grace Hopper from favorites' });
    const names = screen
      .getAllByText(/^(Alan Turing|Grace Hopper)$/)
      .map((node) => node.props.children);
    expect(names).toEqual(['Alan Turing', 'Grace Hopper']);
  });

  it('reorders once something else refreshes the list, after a friend is favorited', async () => {
    const alan = { ...ada, id: 'alan-id', name: 'Alan Turing', groupId: 'alan-group' };
    const grace = { ...ada, id: 'grace-id', name: 'Grace Hopper', groupId: 'grace-group' };
    mockFetchFriends
      .mockResolvedValueOnce([alan, grace]) // initial load
      .mockResolvedValueOnce([alan, { ...grace, favorite: true }]) // the toggle's own refetch: order kept
      // A later, unrelated refresh (say, a favorite set from the group's own
      // page) — a real server always answers with favorites first
      // (`docs/specs/favorites.md`), and this is where that finally shows.
      .mockResolvedValue([{ ...grace, favorite: true }, alan]);

    await render(<FriendsScreen />);
    await screen.findByText('Alan Turing');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Add Grace Hopper to favorites' }),
    );
    await screen.findByRole('button', { name: 'Remove Grace Hopper from favorites' });

    await act(async () => {
      groupsChanged.notify();
    });

    await waitFor(() => {
      const names = screen
        .getAllByText(/^(Alan Turing|Grace Hopper)$/)
        .map((node) => node.props.children);
      expect(names).toEqual(['Grace Hopper', 'Alan Turing']);
    });
  });
});
