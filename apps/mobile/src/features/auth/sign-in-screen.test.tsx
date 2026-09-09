import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { GoogleSignInCancelled } from './google-module';
import { SignInScreen } from './sign-in-screen';

const mockSignIn = jest.fn<() => Promise<void>>();
const mockAuth = { googleAvailable: true };

jest.mock('./use-auth', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    googleAvailable: mockAuth.googleAvailable,
    state: { status: 'signedOut' },
    signOut: jest.fn(),
    retry: jest.fn(),
    authorizedFetch: jest.fn(),
  }),
}));

beforeEach(() => {
  mockSignIn.mockReset();
  mockAuth.googleAvailable = true;
});

describe('SignInScreen', () => {
  it('runs the Google sign-in flow when the button is pressed', async () => {
    mockSignIn.mockResolvedValue(undefined);
    await render(<SignInScreen />);

    await fireEvent.press(screen.getByRole('button', { name: /continue with google/i }));

    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error when sign-in fails', async () => {
    mockSignIn.mockRejectedValue(new Error('backend down'));
    await render(<SignInScreen />);

    await fireEvent.press(screen.getByRole('button'));

    expect(await screen.findByText(/could not sign you in/i)).toBeTruthy();
  });

  it('stays silent when the user cancels the Google dialog', async () => {
    mockSignIn.mockRejectedValue(new GoogleSignInCancelled());
    await render(<SignInScreen />);

    await fireEvent.press(screen.getByRole('button'));

    expect(mockSignIn).toHaveBeenCalled();
    expect(screen.queryByText(/could not sign you in/i)).toBeNull();
  });

  it('disables the action and explains why on the web target', async () => {
    mockAuth.googleAvailable = false;
    await render(<SignInScreen />);

    expect(screen.getByText(/web sign-in is coming soon/i)).toBeTruthy();
    expect(screen.getByRole('button', { disabled: true })).toBeTruthy();
  });
});
