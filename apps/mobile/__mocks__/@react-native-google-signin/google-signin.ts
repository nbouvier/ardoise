import { jest } from '@jest/globals';

/**
 * Manual Jest mock for the native Google Sign-In SDK. Tests drive auth flows
 * through an injected `GoogleModule` fake, so this only needs to keep imports of
 * the real module from touching native code.
 */
export const statusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
};

export const GoogleSignin = {
  configure: jest.fn(),
  hasPlayServices: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  signIn: jest
    .fn<() => Promise<unknown>>()
    .mockResolvedValue({ type: 'success', data: { idToken: 'mock-id-token' } }),
  signOut: jest.fn<() => Promise<null>>().mockResolvedValue(null),
  signInSilently: jest
    .fn<() => Promise<unknown>>()
    .mockResolvedValue({ type: 'noSavedCredentialFound' }),
};

export const GoogleSigninButton = () => null;

export const isSuccessResponse = (response: unknown): boolean =>
  typeof response === 'object' &&
  response !== null &&
  (response as { type?: string }).type === 'success';

export const isErrorWithCode = (error: unknown): error is { code: string } =>
  typeof error === 'object' && error !== null && 'code' in error;
