import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/errors';

import { GoogleSignInCancelled } from './google-module';
import { SignInScreen } from './sign-in-screen';

const mockSignIn = jest.fn<() => Promise<void>>();
const mockSignInWithPassword = jest.fn<(email: string, password: string) => Promise<void>>();
const mockAuth = { googleAvailable: true };

jest.mock('./use-auth', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    signInWithPassword: mockSignInWithPassword,
    googleAvailable: mockAuth.googleAvailable,
    state: { status: 'signedOut' },
  }),
}));

const mockOpenBrowser = jest.fn<(url: string) => Promise<unknown>>();
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (url: string) => mockOpenBrowser(url),
  WebBrowserPresentationStyle: { AUTOMATIC: 'automatic' },
}));

const onCreateAccount = jest.fn();
const onForgotPassword = jest.fn();

beforeEach(() => {
  mockOpenBrowser.mockReset().mockResolvedValue({ type: 'dismiss' });
  mockSignIn.mockReset();
  mockSignInWithPassword.mockReset().mockResolvedValue(undefined);
  onCreateAccount.mockReset();
  onForgotPassword.mockReset();
  mockAuth.googleAvailable = true;
});

/** The screen as the flow renders it, with the address it carries. */
function renderScreen(email = '') {
  return render(
    <SignInScreen
      email={email}
      onEmailChange={jest.fn()}
      onCreateAccount={onCreateAccount}
      onForgotPassword={onForgotPassword}
    />,
  );
}

describe('SignInScreen', () => {
  describe('with a password', () => {
    it('signs in with the address and the password', async () => {
      await renderScreen('ada@example.com');

      await fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse battery');
      await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

      expect(mockSignInWithPassword).toHaveBeenCalledWith(
        'ada@example.com',
        'correct horse battery',
      );
    });

    it('asks for both before calling the server', async () => {
      await renderScreen('');

      await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

      expect(screen.getByText('Enter your e-mail and password.')).toBeTruthy();
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
    });

    it('says the address or password is wrong, without saying which', async () => {
      mockSignInWithPassword.mockRejectedValue(new ApiError(401, 'invalid_credentials'));
      await renderScreen('ada@example.com');

      await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
      await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

      expect(await screen.findByText('Incorrect e-mail or password.')).toBeTruthy();
    });

    it('says to wait after too many attempts', async () => {
      mockSignInWithPassword.mockRejectedValue(new ApiError(429, 'rate_limited'));
      await renderScreen('ada@example.com');

      await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
      await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

      expect(await screen.findByText(/too many attempts/i)).toBeTruthy();
    });

    it('shows and hides the password', async () => {
      await renderScreen();

      expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
      await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
      expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    });

    it('leads to account creation and to the forgotten password', async () => {
      await renderScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Create an account' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Forgot password?' }));

      expect(onCreateAccount).toHaveBeenCalledTimes(1);
      expect(onForgotPassword).toHaveBeenCalledTimes(1);
    });
  });

  describe('with Google', () => {
    it('runs the Google sign-in flow when the button is pressed', async () => {
      mockSignIn.mockResolvedValue(undefined);
      await renderScreen();

      await fireEvent.press(screen.getByRole('button', { name: /continue with google/i }));

      expect(mockSignIn).toHaveBeenCalledTimes(1);
    });

    it('surfaces an error when sign-in fails', async () => {
      mockSignIn.mockRejectedValue(new Error('backend down'));
      await renderScreen();

      await fireEvent.press(screen.getByRole('button', { name: /continue with google/i }));

      expect(await screen.findByText(/could not sign you in with google/i)).toBeTruthy();
    });

    it('stays silent when the user cancels the Google dialog', async () => {
      mockSignIn.mockRejectedValue(new GoogleSignInCancelled());
      await renderScreen();

      await fireEvent.press(screen.getByRole('button', { name: /continue with google/i }));

      expect(mockSignIn).toHaveBeenCalled();
      expect(screen.queryByText(/could not sign you in/i)).toBeNull();
    });

    it('disables the Google action and explains why on the web target, the form still there', async () => {
      mockAuth.googleAvailable = false;
      await renderScreen();

      expect(screen.getByText(/google sign-in on the web is coming soon/i)).toBeTruthy();
      expect(
        screen.getByRole('button', { name: /continue with google/i, disabled: true }),
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Sign in', disabled: false })).toBeTruthy();
    });
  });

  it('says that continuing accepts the terms, linking them and the privacy policy', async () => {
    await renderScreen();

    expect(screen.getByText(/By continuing, you agree to the/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: 'Terms of use' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Privacy policy' }));

    expect(mockOpenBrowser).toHaveBeenNthCalledWith(1, expect.stringMatching(/\/terms$/));
    expect(mockOpenBrowser).toHaveBeenNthCalledWith(2, expect.stringMatching(/\/privacy$/));
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});
