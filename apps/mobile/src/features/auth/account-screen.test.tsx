import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { AccountScreen } from './account-screen';
import { GoogleSignInCancelled } from './google-module';

const mockSignOut = jest.fn<() => Promise<void>>();
const mockSignIn = jest.fn<() => Promise<void>>();
const mockState: { status: string; user?: unknown } = {
  status: 'signedIn',
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    picture: null,
  },
};

jest.mock('./use-auth', () => ({
  useAuth: () => ({
    state: mockState,
    signOut: mockSignOut,
    signIn: mockSignIn,
    retry: jest.fn(),
    googleAvailable: true,
    authorizedFetch: jest.fn(),
  }),
}));

beforeEach(() => {
  mockSignOut.mockReset();
  mockSignOut.mockResolvedValue(undefined);
  mockSignIn.mockReset();
  mockSignIn.mockResolvedValue(undefined);
});

async function openProfileMenu() {
  await fireEvent.press(screen.getByRole('button', { name: /Ada Lovelace/ }));
}

describe('AccountScreen', () => {
  it('shows the signed-in Google profile as a row under a Profile heading', async () => {
    await render(<AccountScreen />);

    expect(screen.getByText('Profile')).toBeTruthy();
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
  });

  it('keeps the account actions out of sight until the profile row is tapped', async () => {
    await render(<AccountScreen />);

    expect(screen.queryByText('Sign out')).toBeNull();
    expect(screen.queryByText('Switch account')).toBeNull();

    await openProfileMenu();

    expect(screen.getByText('Sign out')).toBeTruthy();
    expect(screen.getByText('Switch account')).toBeTruthy();
  });

  it('signs out from the profile menu', async () => {
    await render(<AccountScreen />);
    await openProfileMenu();

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('switches account by signing out, then straight into the Google chooser', async () => {
    await render(<AccountScreen />);
    await openProfileMenu();

    await fireEvent.press(screen.getByRole('button', { name: 'Switch account' }));

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when the chooser is dismissed', async () => {
    mockSignIn.mockRejectedValue(new GoogleSignInCancelled());
    await render(<AccountScreen />);
    await openProfileMenu();

    await fireEvent.press(screen.getByRole('button', { name: 'Switch account' }));

    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });
});
