import type { FriendSummary, GroupDetail } from '@splitcount/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/errors';

import { GroupScreen } from './group-screen';

const ada: FriendSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ada Lovelace',
  picture: null,
};

const grace: FriendSummary = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Grace Hopper',
  picture: null,
};

const trip: GroupDetail = {
  id: '33333333-3333-4333-8333-333333333333',
  kind: 'standard',
  name: 'Corsica 2026',
  memberCount: 2,
  archivedAt: null,
  createdAt: '2026-09-11T12:00:00.000Z',
  members: [
    { ...ada, role: 'owner' },
    { ...grace, role: 'member' },
  ],
  viewerRole: 'owner',
};

/** The implicit group two friends share: named after the other person. */
const pair: GroupDetail = {
  ...trip,
  id: '55555555-5555-4555-8555-555555555555',
  kind: 'pair',
  name: 'Grace Hopper',
  members: [
    { ...ada, role: 'member' },
    { ...grace, role: 'member' },
  ],
  viewerRole: 'member',
};

const mockFetchGroup = jest.fn<() => Promise<GroupDetail>>();

const mockAuthContext = {
  authorizedFetch: jest.fn(),
  state: { status: 'signedIn', user: { ...ada, email: 'ada@example.com' } },
};

jest.mock('@/features/auth/use-auth', () => ({
  useAuth: () => mockAuthContext,
}));

jest.mock('@/lib/api/groups', () => ({
  fetchGroup: () => mockFetchGroup(),
  updateGroup: jest.fn(),
  deleteGroup: jest.fn(),
  addGroupMembers: jest.fn(),
  removeGroupMember: jest.fn(),
  fetchGroupInvite: jest.fn(),
  rotateGroupInvite: jest.fn(),
}));

jest.mock('@/lib/api/friends', () => ({
  fetchFriends: async () => [],
  removeFriend: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

beforeEach(() => {
  mockFetchGroup.mockReset().mockResolvedValue(trip);
});

describe('GroupScreen', () => {
  it('shows the group, its size and its members', async () => {
    await render(<GroupScreen groupId={trip.id} />);

    expect(await screen.findByText('Corsica 2026')).toBeTruthy();
    expect(screen.getByText('2 members')).toBeTruthy();
    expect(screen.getByText('Grace Hopper')).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
  });

  it('offers the management actions to a member', async () => {
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');

    for (const action of [/add friends/i, /share an invitation link/i, /rename/i, /archive group/i]) {
      expect(screen.getByRole('button', { name: action })).toBeTruthy();
    }
  });

  it('keeps deletion to the owner', async () => {
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');

    expect(screen.getByRole('button', { name: /delete this group/i })).toBeTruthy();
    // The owner cannot strand the others.
    expect(screen.queryByRole('button', { name: /leave group/i })).toBeNull();
  });

  it('lets a plain member leave but not delete', async () => {
    mockFetchGroup.mockResolvedValue({ ...trip, viewerRole: 'member' });

    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');

    expect(screen.getByRole('button', { name: /leave group/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /delete this group/i })).toBeNull();
  });

  it('drops the membership actions of an archived group, and offers to reopen it', async () => {
    mockFetchGroup.mockResolvedValue({ ...trip, archivedAt: '2026-09-12T12:00:00.000Z' });

    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');

    expect(screen.getByText(/Archived/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /reopen group/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /add friends/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /share an invitation link/i })).toBeNull();
  });

  it('shows a pair group named after the other person, with no way to change who is in it', async () => {
    mockFetchGroup.mockResolvedValue(pair);

    await render(<GroupScreen groupId={pair.id} />);

    // The other person names the group *and* appears in its member list.
    expect(await screen.findAllByText('Grace Hopper')).toHaveLength(2);
    // Absent, not disabled: none of these can ever apply to a pair group.
    for (const action of [
      /add friends/i,
      /share an invitation link/i,
      /rename/i,
      /archive group/i,
      /leave group/i,
      /delete this group/i,
    ]) {
      expect(screen.queryByRole('button', { name: action })).toBeNull();
    }
    expect(screen.getByText(/just the two of you/)).toBeTruthy();
  });

  it('says so when the group is gone', async () => {
    mockFetchGroup.mockRejectedValue(new ApiError(404, 'group_not_found'));

    await render(<GroupScreen groupId={trip.id} />);

    expect(await screen.findByText('This group is gone')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('offers a retry when the server cannot be reached', async () => {
    mockFetchGroup.mockRejectedValueOnce(new Error('offline'));

    await render(<GroupScreen groupId={trip.id} />);

    expect(await screen.findByText(/couldn’t load this group/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });
});
