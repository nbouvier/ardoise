import type { AcceptInviteResult, InvitePreview, PlaceholdersResponse } from '@ardoise/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/errors';
import { render } from '@/test-utils/render';

import { AcceptInviteScreen } from './accept-invite-screen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const CODE = 'Zx3k9QpL2mN7vR1sT4uW8g';

const ada = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ada Lovelace',
  picture: null,
};

const group = {
  id: '33333333-3333-4333-8333-333333333333',
  kind: 'standard' as const,
  name: 'Corsica 2026',
  memberCount: 3,
  parentId: null,
  depth: 0,
  ancestors: [],
  subgroupCount: 0,
  viewerBalanceCents: 0,
  favorite: false,
  archivedAt: null,
  createdAt: '2026-09-11T12:00:00.000Z',
  viewerRole: 'member' as const,
};

const mockPreviewInvite = jest.fn<() => Promise<InvitePreview>>();
const mockAcceptInvite = jest.fn<() => Promise<AcceptInviteResult>>();

// Stable across renders, like the real memoised auth context.
const mockAuthContext = { authorizedFetch: jest.fn() };

jest.mock('@/features/auth/use-auth', () => ({
  useAuth: () => mockAuthContext,
}));

jest.mock('@/lib/api/invites', () => ({
  previewInvite: () => mockPreviewInvite(),
  acceptInvite: () => mockAcceptInvite(),
}));

const mockFetchPlaceholders = jest.fn<() => Promise<PlaceholdersResponse>>();
const mockClaimPlaceholder = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('@/lib/api/groups', () => ({
  fetchPlaceholders: () => mockFetchPlaceholders(),
  claimPlaceholder: (...args: unknown[]) => mockClaimPlaceholder(...args),
}));

const onClose = jest.fn();
const onAccepted = jest.fn();

beforeEach(() => {
  mockPreviewInvite.mockReset().mockResolvedValue({ kind: 'friend', inviter: ada });
  mockAcceptInvite
    .mockReset()
    .mockResolvedValue({ kind: 'friend', friend: ada, alreadyFriends: false });
  mockPush.mockReset();
  onClose.mockReset();
  onAccepted.mockReset();
  mockFetchPlaceholders.mockReset().mockResolvedValue({ placeholders: [], viewerCanClaim: true });
  mockClaimPlaceholder.mockReset().mockResolvedValue({});
});

function renderScreen() {
  return render(<AcceptInviteScreen code={CODE} onClose={onClose} onAccepted={onAccepted} />);
}

describe('AcceptInviteScreen', () => {
  it('shows who is inviting before anything is created', async () => {
    await renderScreen();

    expect(await screen.findByText(/Ada Lovelace wants to add you as a friend/)).toBeTruthy();
    expect(mockAcceptInvite).not.toHaveBeenCalled();
  });

  it('creates the friendship when the invitation is accepted', async () => {
    await renderScreen();
    await screen.findByText(/wants to add you/);

    await fireEvent.press(screen.getByRole('button', { name: /accept/i }));

    expect(await screen.findByText(/You’re now friends with Ada Lovelace/)).toBeTruthy();
    expect(mockAcceptInvite).toHaveBeenCalledTimes(1);
    expect(onAccepted).toHaveBeenCalledTimes(1);
  });

  it('says so when they were already friends', async () => {
    mockAcceptInvite.mockResolvedValue({ kind: 'friend', friend: ada, alreadyFriends: true });
    await renderScreen();
    await screen.findByText(/wants to add you/);

    await fireEvent.press(screen.getByRole('button', { name: /accept/i }));

    expect(await screen.findByText(/already friends with Ada Lovelace/)).toBeTruthy();
  });

  it('creates nothing when the invitation is declined', async () => {
    await renderScreen();
    await screen.findByText(/wants to add you/);

    await fireEvent.press(screen.getByRole('button', { name: /not now/i }));

    expect(mockAcceptInvite).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reports an expired link without offering to accept it', async () => {
    mockPreviewInvite.mockRejectedValue(new ApiError(410, 'invite_expired'));

    await renderScreen();

    expect(await screen.findByText(/no longer valid/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
  });

  it('reports an unknown code the same way as an expired one', async () => {
    mockPreviewInvite.mockRejectedValue(new ApiError(404, 'invite_not_found'));

    await renderScreen();

    expect(await screen.findByText(/no longer valid/)).toBeTruthy();
  });

  it('explains that the link is the user’s own', async () => {
    mockAcceptInvite.mockRejectedValue(new ApiError(409, 'self_invite'));
    await renderScreen();
    await screen.findByText(/wants to add you/);

    await fireEvent.press(screen.getByRole('button', { name: /accept/i }));

    expect(await screen.findByText(/your own link/)).toBeTruthy();
  });

  it('offers a retry when the server cannot be reached', async () => {
    mockPreviewInvite.mockRejectedValueOnce(new Error('offline'));

    await renderScreen();

    expect(await screen.findByText(/Can’t reach Ardoise/)).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText(/wants to add you/)).toBeTruthy();
  });

  describe('a group invitation', () => {
    beforeEach(() => {
      mockPreviewInvite.mockResolvedValue({ kind: 'group', inviter: ada, group });
      mockAcceptInvite.mockResolvedValue({ kind: 'group', group, alreadyMember: false });
    });

    it('names the group and who is inviting, before joining anything', async () => {
      await renderScreen();

      expect(await screen.findByText(/Ada Lovelace invited you to/)).toBeTruthy();
      expect(screen.getByText(/Corsica 2026/)).toBeTruthy();
      expect(mockAcceptInvite).not.toHaveBeenCalled();
    });

    it('joins the group and offers to open it', async () => {
      await renderScreen();
      await screen.findByText(/invited you to/);

      await fireEvent.press(screen.getByRole('button', { name: /join group/i }));

      expect(await screen.findByText(/You joined/)).toBeTruthy();
      expect(onAccepted).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'group', alreadyMember: false }),
      );

      await fireEvent.press(screen.getByRole('button', { name: /open group/i }));

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/groups/[id]',
        params: { id: group.id },
      });
      expect(onClose).toHaveBeenCalled();
    });

    it('says so when they were already a member', async () => {
      mockAcceptInvite.mockResolvedValue({ kind: 'group', group, alreadyMember: true });
      await renderScreen();
      await screen.findByText(/invited you to/);

      await fireEvent.press(screen.getByRole('button', { name: /join group/i }));

      expect(await screen.findByText(/already in/)).toBeTruthy();
    });

    describe('with placeholder members', () => {
      const alex = {
        id: '77777777-7777-4777-8777-777777777777',
        name: 'Alex',
        transactionCount: 3,
        balanceCents: 1200,
      };
      const sam = {
        id: '88888888-8888-4888-8888-888888888888',
        name: 'Sam',
        transactionCount: 1,
        balanceCents: 0,
      };

      beforeEach(() => {
        mockFetchPlaceholders.mockResolvedValue({ placeholders: [alex, sam], viewerCanClaim: true });
      });

      async function join() {
        await renderScreen();
        await screen.findByText(/invited you to/);
        await fireEvent.press(screen.getByRole('button', { name: /join group/i }));
      }

      it('asks whether the new member is one of them, after joining', async () => {
        await join();

        expect(await screen.findByText('Is one of these you?')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'I’m Alex' })).toBeTruthy();
        expect(screen.getByText('3 transactions')).toBeTruthy();
        expect(screen.getByText('1 transaction')).toBeTruthy();
        // Already in: the question comes after joining, never instead of it.
        expect(onAccepted).toHaveBeenCalled();
      });

      it('claims the one picked once confirmed, saying what it brings', async () => {
        await join();
        await fireEvent.press(await screen.findByRole('button', { name: 'I’m Alex' }));

        expect(
          screen.getByText(
            'Alex’s 3 transactions become yours. In “Corsica 2026”, Alex is owed 12.00. This can’t be undone.',
          ),
        ).toBeTruthy();
        expect(mockClaimPlaceholder).not.toHaveBeenCalled();
        await fireEvent.press(screen.getByRole('button', { name: 'That’s me' }));

        expect(mockClaimPlaceholder).toHaveBeenCalledWith(expect.anything(), group.id, alex.id);
        expect(await screen.findByText('You joined “Corsica 2026” as Alex')).toBeTruthy();
      });

      it('leaves a plain member who is not on the list', async () => {
        await join();

        await fireEvent.press(await screen.findByRole('button', { name: 'I’m not on the list' }));

        expect(await screen.findByText('You joined “Corsica 2026”')).toBeTruthy();
        expect(mockClaimPlaceholder).not.toHaveBeenCalled();
      });

      it('offers the others when the one picked was claimed meanwhile', async () => {
        mockClaimPlaceholder.mockRejectedValue(new ApiError(404, 'placeholder_not_found'));
        await join();
        await fireEvent.press(await screen.findByRole('button', { name: 'I’m Alex' }));
        await fireEvent.press(screen.getByRole('button', { name: 'That’s me' }));

        expect(await screen.findByText('Alex isn’t in the group any more')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'I’m Alex' })).toBeNull();
        expect(screen.getByRole('button', { name: 'I’m Sam' })).toBeTruthy();
      });

      it('does not ask someone who was already a member, or who already claimed one', async () => {
        mockAcceptInvite.mockResolvedValue({ kind: 'group', group, alreadyMember: true });
        await join();
        expect(await screen.findByText(/already in/)).toBeTruthy();
        expect(mockFetchPlaceholders).not.toHaveBeenCalled();
      });

      it('does not ask when the viewer can no longer claim', async () => {
        mockFetchPlaceholders.mockResolvedValue({ placeholders: [alex], viewerCanClaim: false });
        await join();

        expect(await screen.findByText('You joined “Corsica 2026”')).toBeTruthy();
        expect(screen.queryByText('Is one of these you?')).toBeNull();
      });
    });

    it('treats a group that is gone as a dead link', async () => {
      mockPreviewInvite.mockRejectedValue(new ApiError(410, 'invite_gone'));

      await renderScreen();

      expect(await screen.findByText(/no longer valid/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /join group/i })).toBeNull();
    });
  });
});
