import type { AcceptInviteResponse, InvitePreviewResponse } from '@splitcount/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/errors';

import { AcceptInviteScreen } from './accept-invite-screen';

const CODE = 'Zx3k9QpL2mN7vR1sT4uW8g';

const ada = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ada Lovelace',
  picture: null,
};

const mockPreviewInvite = jest.fn<() => Promise<InvitePreviewResponse>>();
const mockAcceptInvite = jest.fn<() => Promise<AcceptInviteResponse>>();

// Stable across renders, like the real memoised auth context.
const mockAuthContext = { authorizedFetch: jest.fn() };

jest.mock('@/features/auth/use-auth', () => ({
  useAuth: () => mockAuthContext,
}));

jest.mock('@/lib/api/friends', () => ({
  previewInvite: () => mockPreviewInvite(),
  acceptInvite: () => mockAcceptInvite(),
}));

const onClose = jest.fn();
const onAccepted = jest.fn();

beforeEach(() => {
  mockPreviewInvite.mockReset().mockResolvedValue({ inviter: ada });
  mockAcceptInvite.mockReset().mockResolvedValue({ friend: ada, alreadyFriends: false });
  onClose.mockReset();
  onAccepted.mockReset();
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
    mockAcceptInvite.mockResolvedValue({ friend: ada, alreadyFriends: true });
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

    expect(await screen.findByText(/Can’t reach SplitCount/)).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText(/wants to add you/)).toBeTruthy();
  });
});
