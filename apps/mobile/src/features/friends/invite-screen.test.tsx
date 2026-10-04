import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';

import type { Invite } from '@ardoise/shared';

import { InviteScreen } from './invite-screen';

const invite: Invite = {
  code: 'Zx3k9QpL2mN7vR1sT4uW8g',
  url: 'https://api.test/i/Zx3k9QpL2mN7vR1sT4uW8g',
  expiresAt: '2026-09-17T12:00:00.000Z',
};

const rotated: Invite = { ...invite, code: 'AAAAAAAAAAAAAAAAAAAAAA', url: 'https://api.test/i/AAAAAAAAAAAAAAAAAAAAAA' };

const mockFetchInvite = jest.fn<() => Promise<Invite>>();
const mockRotateInvite = jest.fn<() => Promise<Invite>>();
const mockSetString = jest.fn<(value: string) => Promise<void>>();

// The real context memoises its value, so `authorizedFetch` is stable across
// renders. The fake must be too, or the load effect re-runs on every render.
const mockAuthContext = { authorizedFetch: jest.fn() };

jest.mock('@/features/auth/use-auth', () => ({
  useAuth: () => mockAuthContext,
}));

jest.mock('@/lib/api/friends', () => ({
  fetchInvite: () => mockFetchInvite(),
  rotateInvite: () => mockRotateInvite(),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: (value: string) => mockSetString(value),
}));

beforeEach(() => {
  mockFetchInvite.mockReset().mockResolvedValue(invite);
  mockRotateInvite.mockReset().mockResolvedValue(rotated);
  mockSetString.mockReset().mockResolvedValue(undefined);
});

describe('InviteScreen', () => {
  it('shows the shareable link and when it stops working', async () => {
    await render(<InviteScreen />);

    expect(await screen.findByText(invite.url)).toBeTruthy();
    expect(screen.getByText(/This link works until/)).toBeTruthy();
  });

  it('copies the link to the clipboard', async () => {
    await render(<InviteScreen />);
    await screen.findByText(invite.url);

    await fireEvent.press(screen.getByRole('button', { name: /copy link/i }));

    await waitFor(() => expect(mockSetString).toHaveBeenCalledWith(invite.url));
    // The icon flips to a tick, and says so in words.
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('opens the OS share sheet with the link', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    await render(<InviteScreen />);
    await screen.findByText(invite.url);

    await fireEvent.press(screen.getByRole('button', { name: /^share$/i }));

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: invite.url })),
    );
    share.mockRestore();
  });

  it('puts share, copy and generate as icons on the link’s own title line', async () => {
    await render(<InviteScreen />);
    await screen.findByText(invite.url);

    for (const name of ['Share', 'Copy link', 'Generate a new link']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    // The warning moved into the confirmation; it is no longer on the page.
    expect(screen.queryByText(/stops the previous one/)).toBeNull();
  });

  it('copies the link, and says so, when the link itself is tapped', async () => {
    await render(<InviteScreen />);
    await screen.findByText(invite.url);
    expect(screen.queryByText('Copied')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: /tap to copy/i }));

    await waitFor(() => expect(mockSetString).toHaveBeenCalledWith(invite.url));
    expect(await screen.findByText('Copied')).toBeTruthy();
  });

  it('lets the "Copied" tooltip go after a couple of seconds', async () => {
    jest.useFakeTimers();
    try {
      await render(<InviteScreen />);
      await screen.findByText(invite.url);

      await fireEvent.press(screen.getByRole('button', { name: /tap to copy/i }));
      expect(await screen.findByText('Copied')).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(2100);
      });

      expect(screen.queryByText('Copied')).toBeNull();
      // The icon goes back to "copy" with it.
      expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('warns in the app’s own dialog before replacing the link, then replaces it', async () => {
    await render(<InviteScreen />);
    await screen.findByText(invite.url);
    expect(screen.queryByText(/stops the previous one/)).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: /generate a new link/i }));

    expect(screen.getByText('Generate a new link?')).toBeTruthy();
    expect(screen.getByText(/stops the previous one from working/)).toBeTruthy();
    // Nothing happens until the warning is accepted.
    expect(mockRotateInvite).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Generate' }));

    expect(mockRotateInvite).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(rotated.url)).toBeTruthy();
    expect(screen.queryByText(invite.url)).toBeNull();
  });

  it('keeps the link when the warning is cancelled', async () => {
    await render(<InviteScreen />);
    await screen.findByText(invite.url);

    await fireEvent.press(screen.getByRole('button', { name: /generate a new link/i }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockRotateInvite).not.toHaveBeenCalled();
    expect(screen.getByText(invite.url)).toBeTruthy();
  });

  it('offers a retry when the link cannot be created', async () => {
    mockFetchInvite.mockRejectedValueOnce(new Error('offline'));

    await render(<InviteScreen />);

    expect(await screen.findByText(/Can’t create a link/)).toBeTruthy();

    mockFetchInvite.mockResolvedValueOnce(invite);
    await fireEvent.press(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText(invite.url)).toBeTruthy();
  });
});
