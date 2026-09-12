import type { FriendSummary, GroupDetail } from '@splitcount/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CreateGroupScreen } from './create-group-screen';

const grace: FriendSummary = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Grace Hopper',
  picture: null,
};

const created = {
  id: '33333333-3333-4333-8333-333333333333',
  kind: 'standard',
  name: 'Corsica 2026',
  memberCount: 2,
  archivedAt: null,
  createdAt: '2026-09-11T12:00:00.000Z',
  members: [],
  viewerRole: 'owner',
} as unknown as GroupDetail;

const mockCreateGroup = jest.fn<(input: unknown) => Promise<GroupDetail>>();
const mockFetchFriends = jest.fn<() => Promise<FriendSummary[]>>();

const mockAuthContext = { authorizedFetch: jest.fn() };

jest.mock('@/features/auth/use-auth', () => ({
  useAuth: () => mockAuthContext,
}));

jest.mock('@/lib/api/groups', () => ({
  createGroup: (_fetcher: unknown, input: unknown) => mockCreateGroup(input),
}));

jest.mock('@/lib/api/friends', () => ({
  fetchFriends: () => mockFetchFriends(),
  removeFriend: jest.fn(),
}));

const onCreated = jest.fn();
const onCancel = jest.fn();

beforeEach(() => {
  mockCreateGroup.mockReset().mockResolvedValue(created);
  mockFetchFriends.mockReset().mockResolvedValue([grace]);
  onCreated.mockReset();
  onCancel.mockReset();
});

const renderScreen = (parentId?: string) =>
  render(<CreateGroupScreen onCreated={onCreated} onCancel={onCancel} parentId={parentId} />);

describe('CreateGroupScreen', () => {
  it('will not create a group without a name', async () => {
    await renderScreen();

    expect(
      screen.getByRole('button', { name: /create group/i }).props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  it('creates a group with the name alone', async () => {
    await renderScreen();
    await screen.findByText('Grace Hopper');

    await fireEvent.changeText(screen.getByLabelText('Group name'), 'Corsica 2026');
    await fireEvent.press(screen.getByRole('button', { name: /create group/i }));

    expect(mockCreateGroup).toHaveBeenCalledWith({
      name: 'Corsica 2026',
      memberIds: [],
    });
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it('includes the friends that were picked', async () => {
    await renderScreen();
    await screen.findByText('Grace Hopper');

    await fireEvent.changeText(screen.getByLabelText('Group name'), 'Corsica 2026');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Grace Hopper' }));
    await fireEvent.press(screen.getByRole('button', { name: /create group/i }));

    expect(mockCreateGroup).toHaveBeenCalledWith({
      name: 'Corsica 2026',
      memberIds: [grace.id],
    });
  });

  it('unpicks a friend that was picked by mistake', async () => {
    await renderScreen();
    await screen.findByText('Grace Hopper');

    await fireEvent.changeText(screen.getByLabelText('Group name'), 'Corsica 2026');
    const option = screen.getByRole('checkbox', { name: 'Grace Hopper' });
    await fireEvent.press(option);
    await fireEvent.press(option);
    await fireEvent.press(screen.getByRole('button', { name: /create group/i }));

    expect(mockCreateGroup).toHaveBeenCalledWith({
      name: 'Corsica 2026',
      memberIds: [],
    });
  });

  it('keeps what was typed when creation fails', async () => {
    mockCreateGroup.mockRejectedValue(new Error('offline'));
    await renderScreen();
    await screen.findByText('Grace Hopper');

    await fireEvent.changeText(screen.getByLabelText('Group name'), 'Corsica 2026');
    await fireEvent.press(screen.getByRole('button', { name: /create group/i }));

    expect(await screen.findByText(/couldn’t create the group/)).toBeTruthy();
    expect(screen.getByLabelText('Group name').props.value).toBe('Corsica 2026');
    expect(onCreated).not.toHaveBeenCalled();
  });

  describe('as a sub-group', () => {
    const parentId = '99999999-9999-4999-8999-999999999999';

    it('titles itself and sends the parent along', async () => {
      await renderScreen(parentId);
      await screen.findByText('Grace Hopper');

      expect(screen.getByText('New sub-group')).toBeTruthy();

      await fireEvent.changeText(screen.getByLabelText('Group name'), 'Ajaccio weekend');
      await fireEvent.press(screen.getByRole('button', { name: /create sub-group/i }));

      expect(mockCreateGroup).toHaveBeenCalledWith({
        name: 'Ajaccio weekend',
        memberIds: [],
        parentId,
      });
    });

    it('says so when creation fails', async () => {
      mockCreateGroup.mockRejectedValue(new Error('offline'));
      await renderScreen(parentId);
      await screen.findByText('Grace Hopper');

      await fireEvent.changeText(screen.getByLabelText('Group name'), 'Ajaccio weekend');
      await fireEvent.press(screen.getByRole('button', { name: /create sub-group/i }));

      expect(await screen.findByText(/couldn’t create the sub-group/)).toBeTruthy();
    });
  });
});
