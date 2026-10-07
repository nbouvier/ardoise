import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { PasswordResetConfirmRequest, SignupRequest } from '@ardoise/shared';

import { ApiError } from '@/lib/api/errors';

import { SignedOutFlow } from './signed-out-flow';

const mockRequestSignup = jest.fn<(request: SignupRequest) => Promise<void>>();
const mockVerifySignup = jest.fn<(email: string, code: string) => Promise<void>>();
const mockRequestPasswordReset = jest.fn<(email: string) => Promise<void>>();
const mockConfirmPasswordReset = jest.fn<(request: PasswordResetConfirmRequest) => Promise<void>>();

jest.mock('./use-auth', () => ({
  useAuth: () => ({
    state: { status: 'signedOut' },
    googleAvailable: true,
    signIn: jest.fn(),
    signInWithPassword: jest.fn(),
    requestSignup: mockRequestSignup,
    verifySignup: mockVerifySignup,
    requestPasswordReset: mockRequestPasswordReset,
    confirmPasswordReset: mockConfirmPasswordReset,
  }),
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
  WebBrowserPresentationStyle: { AUTOMATIC: 'automatic' },
}));

beforeEach(() => {
  mockRequestSignup.mockReset().mockResolvedValue(undefined);
  mockVerifySignup.mockReset().mockResolvedValue(undefined);
  mockRequestPasswordReset.mockReset().mockResolvedValue(undefined);
  mockConfirmPasswordReset.mockReset().mockResolvedValue(undefined);
});

const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
const type = (label: string, text: string) => fireEvent.changeText(screen.getByLabelText(label), text);

async function fillSignUp() {
  await press('Create an account');
  await type('Name', '  Ada Lovelace ');
  await type('E-mail', ' Ada@Example.com');
  await type('Password', 'correct horse battery');
}

describe('signing up', () => {
  it('asks for a code, then creates the account with it', async () => {
    await render(<SignedOutFlow />);
    await fillSignUp();

    await press('Continue');

    expect(mockRequestSignup).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'correct horse battery',
    });
    expect(await screen.findByText('Check your e-mail')).toBeTruthy();
    expect(screen.getByText('ada@example.com')).toBeTruthy();

    await type('Code', '12 34 56');
    await press('Create my account');

    expect(mockVerifySignup).toHaveBeenCalledWith('ada@example.com', '123456');
  });

  it('checks the form before asking the server anything', async () => {
    await render(<SignedOutFlow />);
    await press('Create an account');
    await type('Name', 'Ada');
    await type('E-mail', 'ada@example.com');
    await type('Password', 'short');

    await press('Continue');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose a password of at least 8 characters.',
    );
    expect(mockRequestSignup).not.toHaveBeenCalled();
  });

  it('says a refused code is not valid, and can send a new one', async () => {
    mockVerifySignup.mockRejectedValue(new ApiError(401, 'invalid_code'));
    await render(<SignedOutFlow />);
    await fillSignUp();
    await press('Continue');
    await screen.findByText('Check your e-mail');

    await type('Code', '000000');
    await press('Create my account');
    expect(await screen.findByText(/this code is not valid/i)).toBeTruthy();

    await press('Resend code');
    expect(mockRequestSignup).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('A new code is on its way.')).toBeTruthy();
  });

  it('goes back to the form, as it was, to change the address', async () => {
    await render(<SignedOutFlow />);
    await fillSignUp();
    await press('Continue');
    await screen.findByText('Check your e-mail');

    await press('Use another e-mail address');

    expect(screen.getByLabelText('Name').props.value).toBe('Ada Lovelace');
    expect(screen.getByLabelText('E-mail').props.value).toBe('ada@example.com');
  });
});

describe('a forgotten password', () => {
  it('carries the address over, asks for a code, then sets the new password with it', async () => {
    await render(<SignedOutFlow />);
    await type('E-mail', 'ada@example.com');

    await press('Forgot password?');
    expect(screen.getByLabelText('E-mail').props.value).toBe('ada@example.com');
    await press('Send me a code');

    expect(mockRequestPasswordReset).toHaveBeenCalledWith('ada@example.com');
    expect(await screen.findByText('Set a new password')).toBeTruthy();

    await type('Code', '123456');
    await type('New password', 'a brand new password');
    await press('Set password and sign in');

    expect(mockConfirmPasswordReset).toHaveBeenCalledWith({
      email: 'ada@example.com',
      code: '123456',
      password: 'a brand new password',
    });
  });

  it('refuses a too-short new password before asking the server', async () => {
    await render(<SignedOutFlow />);
    await press('Forgot password?');
    await type('E-mail', 'ada@example.com');
    await press('Send me a code');
    await screen.findByText('Set a new password');

    await type('Code', '123456');
    await type('New password', 'short');
    await press('Set password and sign in');

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(mockConfirmPasswordReset).not.toHaveBeenCalled();
  });

  it('comes back to sign-in', async () => {
    await render(<SignedOutFlow />);
    await press('Forgot password?');

    await press('Back');

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });
});
