import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { AccountScreen } from './account-screen';

const mockSignOut = jest.fn<() => Promise<void>>();
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
    signIn: jest.fn(),
    retry: jest.fn(),
    googleAvailable: true,
    authorizedFetch: jest.fn(),
  }),
}));

beforeEach(() => {
  mockSignOut.mockReset();
  mockSignOut.mockResolvedValue(undefined);
});

describe('AccountScreen', () => {
  it('shows the signed-in Google profile', async () => {
    await render(<AccountScreen />);

    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
  });

  it('signs out when the button is pressed', async () => {
    await render(<AccountScreen />);

    await fireEvent.press(screen.getByRole('button', { name: /sign out/i }));

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
