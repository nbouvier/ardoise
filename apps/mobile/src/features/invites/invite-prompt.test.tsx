import type { InvitePreview } from '@ardoise/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';

import { render } from '@/test-utils/render';

import { InviteLinkHandler } from './invite-link-handler';
import { InvitePrompt } from './invite-prompt';
import { pendingInvite } from './pending-invite';

const CODE = 'Zx3k9QpL2mN7vR1sT4uW8g';

const mockPreviewInvite = jest.fn<() => Promise<InvitePreview>>();
const mockUseURL = jest.fn<() => string | null>();
const mockAuthContext = { authorizedFetch: jest.fn() };

jest.mock('expo-linking', () => ({
  useURL: () => mockUseURL(),
}));

jest.mock('@/features/auth/use-auth', () => ({
  useAuth: () => mockAuthContext,
}));

jest.mock('@/lib/api/invites', () => ({
  previewInvite: () => mockPreviewInvite(),
  acceptInvite: jest.fn(),
}));

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

beforeEach(() => {
  pendingInvite.clear();
  mockUseURL.mockReset().mockReturnValue(null);
  mockPreviewInvite.mockReset().mockResolvedValue({
    kind: 'friend',
    inviter: { id: '11111111-1111-4111-8111-111111111111', name: 'Ada Lovelace', picture: null },
  });
});

describe('InviteLinkHandler', () => {
  it('parks the code from the URL the app was opened with', async () => {
    mockUseURL.mockReturnValue(`ardoise://invite/${CODE}`);

    await render(<InviteLinkHandler />);

    expect(pendingInvite.getSnapshot()).toBe(CODE);
  });

  it('ignores a URL that is not an invitation', async () => {
    mockUseURL.mockReturnValue('ardoise://account');

    await render(<InviteLinkHandler />);

    expect(pendingInvite.getSnapshot()).toBeNull();
  });
});

describe('InvitePrompt', () => {
  it('stays out of the way when nothing is pending', async () => {
    await render(<InvitePrompt />);

    expect(screen.queryByText(/wants to add you/)).toBeNull();
    expect(mockPreviewInvite).not.toHaveBeenCalled();
  });

  it('picks up a code parked before sign-in', async () => {
    // The link arrived while signed out: the handler stored the code, and this
    // component only mounts once there is a session.
    pendingInvite.set(CODE);

    await render(<InvitePrompt />);

    expect(await screen.findByText(/Ada Lovelace wants to add you as a friend/)).toBeTruthy();
  });

  it('clears the pending invitation when dismissed', async () => {
    pendingInvite.set(CODE);
    await render(<InvitePrompt />);
    await screen.findByText(/wants to add you/);

    await fireEvent.press(screen.getByRole('button', { name: /not now/i }));

    expect(pendingInvite.getSnapshot()).toBeNull();
    expect(screen.queryByText(/wants to add you/)).toBeNull();
  });
});
