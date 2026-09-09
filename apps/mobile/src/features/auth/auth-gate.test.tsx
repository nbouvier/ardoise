import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { AuthState } from './auth-client';
import { AuthGate } from './auth-gate';

const mockRetry = jest.fn<() => Promise<void>>();
const holder: { state: AuthState } = { state: { status: 'loading' } };

jest.mock('./use-auth', () => ({
  useAuth: () => ({
    state: holder.state,
    retry: mockRetry,
    signIn: jest.fn(),
    signOut: jest.fn(),
    googleAvailable: true,
    authorizedFetch: jest.fn(),
  }),
}));

beforeEach(() => {
  mockRetry.mockReset();
  mockRetry.mockResolvedValue(undefined);
});

const child = <Text>protected content</Text>;

describe('AuthGate', () => {
  it('shows a loading indicator while the session is restored', async () => {
    holder.state = { status: 'loading' };
    await render(<AuthGate>{child}</AuthGate>);

    expect(screen.getByTestId('auth-gate-loading')).toBeTruthy();
    expect(screen.queryByText('protected content')).toBeNull();
  });

  it('offers a retry when the server was unreachable', async () => {
    holder.state = { status: 'error' };
    await render(<AuthGate>{child}</AuthGate>);

    await fireEvent.press(screen.getByRole('button', { name: /try again/i }));
    expect(mockRetry).toHaveBeenCalled();
  });

  it('shows the sign-in screen when signed out', async () => {
    holder.state = { status: 'signedOut' };
    await render(<AuthGate>{child}</AuthGate>);

    expect(screen.getByRole('button', { name: /continue with google/i })).toBeTruthy();
    expect(screen.queryByText('protected content')).toBeNull();
  });

  it('renders the app when signed in', async () => {
    holder.state = {
      status: 'signedIn',
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'ada@example.com',
        name: 'Ada',
        picture: null,
      },
    };
    await render(<AuthGate>{child}</AuthGate>);

    expect(screen.getByText('protected content')).toBeTruthy();
  });
});
