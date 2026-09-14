import type { GroupSummary } from '@splitcount/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { pendingInvite } from '@/features/invites/pending-invite';

import { groupsChanged } from './groups-changed';
import { GroupsScreen } from './groups-screen';

const trip: GroupSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  kind: 'standard',
  name: 'Corsica 2026',
  memberCount: 3,
  parentId: null,
  depth: 0,
  subgroupCount: 0,
  viewerBalanceCents: 0,
  favorite: false,
  archivedAt: null,
  createdAt: '2026-09-11T12:00:00.000Z',
};

const lastYear: GroupSummary = {
  ...trip,
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Corsica 2025',
  memberCount: 2,
  archivedAt: '2026-01-02T12:00:00.000Z',
};

const mockFetchGroups = jest.fn<() => Promise<GroupSummary[]>>();
const mockSetGroupFavorite = jest.fn<(...args: unknown[]) => Promise<GroupSummary>>();
const mockPush = jest.fn();

// Stable across renders, like the real memoised auth context.
const mockAuthContext = { authorizedFetch: jest.fn() };

jest.mock('@/features/auth/use-auth', () => ({
  useAuth: () => mockAuthContext,
}));

jest.mock('@/lib/api/groups', () => ({
  fetchGroups: () => mockFetchGroups(),
  createGroup: jest.fn(),
  setGroupFavorite: (...args: unknown[]) => mockSetGroupFavorite(...args),
}));

jest.mock('@/lib/api/friends', () => ({
  fetchFriends: async () => [],
  removeFriend: jest.fn(),
}));

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => {
  mockFetchGroups.mockReset().mockResolvedValue([]);
  mockSetGroupFavorite.mockReset().mockResolvedValue({ ...trip, favorite: true });
  mockPush.mockReset();
  pendingInvite.clear();
});

describe('GroupsScreen', () => {
  it('explains the empty state', async () => {
    await render(<GroupsScreen />);

    expect(await screen.findByText('No groups yet')).toBeTruthy();
  });

  it('lists active groups with their size', async () => {
    mockFetchGroups.mockResolvedValue([trip]);

    await render(<GroupsScreen />);

    expect(await screen.findByText('Corsica 2026')).toBeTruthy();
    expect(screen.getByText('3 members')).toBeTruthy();
  });

  it("shows the viewer's own balance in the group", async () => {
    mockFetchGroups.mockResolvedValue([{ ...trip, viewerBalanceCents: 2500 }]);

    await render(<GroupsScreen />);

    expect(await screen.findByText('You are owed 25.00')).toBeTruthy();
  });

  it('hides archived groups behind a toggle that counts them', async () => {
    mockFetchGroups.mockResolvedValue([trip, lastYear]);

    await render(<GroupsScreen />);
    await screen.findByText('Corsica 2026');

    // Out of the way, but discoverable.
    expect(screen.queryByText('Corsica 2025')).toBeNull();
    const toggle = screen.getByText('Show archived (1)');

    await fireEvent.press(toggle);

    expect(await screen.findByText('Corsica 2025')).toBeTruthy();
    expect(screen.getByText('2 members · archived')).toBeTruthy();

    await fireEvent.press(screen.getByText('Hide archived'));

    expect(screen.queryByText('Corsica 2025')).toBeNull();
  });

  it('shows no toggle when nothing is archived', async () => {
    mockFetchGroups.mockResolvedValue([trip]);

    await render(<GroupsScreen />);
    await screen.findByText('Corsica 2026');

    expect(screen.queryByText(/Show archived/)).toBeNull();
  });

  it('keeps the list when only archived groups are left, instead of the empty state', async () => {
    mockFetchGroups.mockResolvedValue([lastYear]);

    await render(<GroupsScreen />);

    expect(await screen.findByText('Show archived (1)')).toBeTruthy();
    expect(screen.queryByText('No groups yet')).toBeNull();
  });

  it('opens a group when its row is tapped', async () => {
    mockFetchGroups.mockResolvedValue([trip]);

    await render(<GroupsScreen />);
    await screen.findByText('Corsica 2026');

    await fireEvent.press(screen.getByRole('button', { name: 'Corsica 2026' }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/groups/[id]',
      params: { id: trip.id },
    });
  });

  it('toggles a group’s favorite from its row', async () => {
    // The mutation's own response applies immediately; the follow-up
    // `groupsChanged`-triggered refetch must agree with it, not clobber it.
    mockFetchGroups.mockResolvedValueOnce([trip]).mockResolvedValue([{ ...trip, favorite: true }]);

    await render(<GroupsScreen />);
    await screen.findByText('Corsica 2026');

    await fireEvent.press(screen.getByRole('button', { name: 'Add Corsica 2026 to favorites' }));

    expect(mockSetGroupFavorite).toHaveBeenCalledWith(expect.anything(), trip.id, true);
    expect(
      await screen.findByRole('button', { name: 'Remove Corsica 2026 from favorites' }),
    ).toBeTruthy();
  });

  it('does not reorder the list the instant a group is favorited from its row', async () => {
    const alpha = { ...trip, id: 'a', name: 'Alpha' };
    const zulu = { ...trip, id: 'z', name: 'Zulu' };
    // Both the mutation's own optimistic update and the follow-up
    // `groupsChanged`-triggered refetch must agree on the row order staying
    // put — a real server that had already reordered would be indistinguishable
    // here from one that had not, so this response keeps the same order,
    // isolating the one thing this test checks.
    mockFetchGroups
      .mockResolvedValueOnce([alpha, zulu])
      .mockResolvedValue([alpha, { ...zulu, favorite: true }]);

    await render(<GroupsScreen />);
    await screen.findByText('Alpha');

    await fireEvent.press(screen.getByRole('button', { name: 'Add Zulu to favorites' }));

    // The star flips...
    await screen.findByRole('button', { name: 'Remove Zulu from favorites' });
    // ...but Zulu's row stays put rather than jumping to the top under the
    // viewer's finger — the pinned order only ever takes effect on the
    // list's next natural refetch, never synchronously with the tap
    // (`docs/specs/favorites.md`).
    const names = screen.getAllByText(/^(Alpha|Zulu)$/).map((node) => node.props.children);
    expect(names).toEqual(['Alpha', 'Zulu']);
  });

  it('reorders once something else refreshes the list, after a favorite was set', async () => {
    const alpha = { ...trip, id: 'a', name: 'Alpha' };
    const zulu = { ...trip, id: 'z', name: 'Zulu' };
    mockFetchGroups
      .mockResolvedValueOnce([alpha, zulu]) // initial load
      .mockResolvedValueOnce([alpha, { ...zulu, favorite: true }]) // the toggle's own refetch: order kept
      // A later, unrelated refresh (say, a group created on another screen) —
      // a real server always answers with favorites first
      // (`docs/specs/favorites.md`), and this is where that finally shows.
      .mockResolvedValue([{ ...zulu, favorite: true }, alpha]);

    await render(<GroupsScreen />);
    await screen.findByText('Alpha');

    await fireEvent.press(screen.getByRole('button', { name: 'Add Zulu to favorites' }));
    await screen.findByRole('button', { name: 'Remove Zulu from favorites' });

    await act(async () => {
      groupsChanged.notify();
    });

    await waitFor(() => {
      const names = screen.getAllByText(/^(Alpha|Zulu)$/).map((node) => node.props.children);
      expect(names).toEqual(['Zulu', 'Alpha']);
    });
  });

  it('offers a retry when the list cannot be loaded', async () => {
    mockFetchGroups.mockRejectedValueOnce(new Error('offline'));

    await render(<GroupsScreen />);

    expect(await screen.findByText(/couldn’t load your groups/)).toBeTruthy();

    mockFetchGroups.mockResolvedValueOnce([trip]);
    await fireEvent.press(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('Corsica 2026')).toBeTruthy();
  });

  it('opens the creation sheet from the add menu', async () => {
    await render(<GroupsScreen />);
    await screen.findByText('No groups yet');

    await fireEvent.press(screen.getByRole('button', { name: 'New group' }));
    await fireEvent.press(screen.getByText('Create a group'));

    expect(await screen.findByLabelText('Group name')).toBeTruthy();
  });

  it('offers the same "got a code?" entry as the Friends tab, for a group code', async () => {
    await render(<GroupsScreen />);
    await screen.findByText('No groups yet');

    await fireEvent.press(screen.getByRole('button', { name: 'New group' }));
    await fireEvent.press(screen.getByText('Join a group'));

    await fireEvent.changeText(
      screen.getByLabelText('Invitation code'),
      'Zx3k9QpL2mN7vR1sT4uW8g',
    );
    await fireEvent.press(screen.getByRole('button', { name: /^open$/i }));

    expect(pendingInvite.getSnapshot()).toBe('Zx3k9QpL2mN7vR1sT4uW8g');
  });
});
