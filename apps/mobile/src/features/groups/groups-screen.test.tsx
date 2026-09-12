import type { GroupSummary } from '@splitcount/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { pendingInvite } from '@/features/invites/pending-invite';

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
const mockPush = jest.fn();

// Stable across renders, like the real memoised auth context.
const mockAuthContext = { authorizedFetch: jest.fn() };

jest.mock('@/features/auth/use-auth', () => ({
  useAuth: () => mockAuthContext,
}));

jest.mock('@/lib/api/groups', () => ({
  fetchGroups: () => mockFetchGroups(),
  createGroup: jest.fn(),
}));

jest.mock('@/lib/api/friends', () => ({
  fetchFriends: async () => [],
  removeFriend: jest.fn(),
}));

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => {
  mockFetchGroups.mockReset().mockResolvedValue([]);
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

  it("shows the viewer's balance rolled up over the group and its sub-groups", async () => {
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

  it('offers a retry when the list cannot be loaded', async () => {
    mockFetchGroups.mockRejectedValueOnce(new Error('offline'));

    await render(<GroupsScreen />);

    expect(await screen.findByText(/couldn’t load your groups/)).toBeTruthy();

    mockFetchGroups.mockResolvedValueOnce([trip]);
    await fireEvent.press(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('Corsica 2026')).toBeTruthy();
  });

  it('opens the creation sheet', async () => {
    await render(<GroupsScreen />);
    await screen.findByText('No groups yet');

    await fireEvent.press(screen.getByRole('button', { name: /create a group/i }));

    expect(await screen.findByText('New group')).toBeTruthy();
  });

  it('offers the same "got a code?" entry as the Friends tab, for a group code', async () => {
    await render(<GroupsScreen />);
    await screen.findByText('No groups yet');

    await fireEvent.changeText(
      screen.getByLabelText('Invitation code'),
      'Zx3k9QpL2mN7vR1sT4uW8g',
    );
    await fireEvent.press(screen.getByRole('button', { name: /^open$/i }));

    expect(pendingInvite.getSnapshot()).toBe('Zx3k9QpL2mN7vR1sT4uW8g');
  });
});
