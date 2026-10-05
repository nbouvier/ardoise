import type { AccountDeletionPreview } from '@ardoise/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { DeleteAccountScreen } from './delete-account-screen';

const mockFetchPreview = jest.fn<() => Promise<AccountDeletionPreview>>();
const mockDeleteAccount = jest.fn<() => Promise<void>>();

// One object for every render, as the real context's value is: a new
// `authorizedFetch` each time would reload the preview on every render.
const mockAuthContext = {
  authorizedFetch: jest.fn(),
  deleteAccount: () => mockDeleteAccount(),
};

jest.mock('./use-auth', () => ({
  useAuth: () => mockAuthContext,
}));

jest.mock('@/lib/api/account', () => ({
  fetchDeletionPreview: () => mockFetchPreview(),
}));

const preview: AccountDeletionPreview = {
  friendCount: 2,
  balances: [
    {
      groupId: '33333333-3333-4333-8333-333333333333',
      kind: 'standard',
      name: 'Flat',
      balanceCents: 600,
    },
    {
      groupId: '44444444-4444-4444-8444-444444444444',
      kind: 'pair',
      name: 'Grace Hopper',
      balanceCents: -50,
    },
  ],
};

const onClose = jest.fn();

beforeEach(() => {
  mockFetchPreview.mockReset().mockResolvedValue(preview);
  mockDeleteAccount.mockReset().mockResolvedValue(undefined);
  onClose.mockReset();
});

async function renderLoaded() {
  await render(<DeleteAccountScreen onClose={onClose} />);
  await screen.findByText('What is deleted');
}

const pressDeleteButton = () =>
  fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));

describe('DeleteAccountScreen', () => {
  it('spells out what goes, what stays and that it is permanent', async () => {
    await renderLoaded();

    expect(screen.getByText(/Your 2 friends, and the group you share with each of them/)).toBeTruthy();
    expect(screen.getByText('What stays')).toBeTruthy();
    expect(screen.getByText(/Your part in them becomes “Others”/)).toBeTruthy();
    expect(screen.getByText(/pass to the member who has been in them the longest/)).toBeTruthy();
    expect(screen.getByText(/cannot be undone/)).toBeTruthy();
  });

  it('lists every group whose balance would be lost, with that balance', async () => {
    await renderLoaded();

    expect(screen.getByText('Flat')).toBeTruthy();
    expect(screen.getByText('You are owed 6.00')).toBeTruthy();
    expect(screen.getByText('Grace Hopper')).toBeTruthy();
    expect(screen.getByText('You owe 0.50')).toBeTruthy();
  });

  it('says so when no balance would be lost, and when there is no friend', async () => {
    mockFetchPreview.mockResolvedValue({ friendCount: 0, balances: [] });
    await renderLoaded();

    expect(screen.getByText('You’re settled up in every group.')).toBeTruthy();
    expect(screen.getByText('Your friend list.')).toBeTruthy();
  });

  it('deletes nothing until the final prompt is confirmed', async () => {
    await renderLoaded();

    await pressDeleteButton();
    expect(screen.getByText('Delete your account?')).toBeTruthy();
    expect(mockDeleteAccount).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockDeleteAccount).not.toHaveBeenCalled();

    await pressDeleteButton();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it('keeps the page, with an error and the button back, when the deletion fails', async () => {
    mockDeleteAccount.mockRejectedValue(new Error('offline'));
    await renderLoaded();

    await pressDeleteButton();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText(/We couldn’t delete your account/)).toBeTruthy();
    await pressDeleteButton();
    expect(screen.getByText('Delete your account?')).toBeTruthy();
  });

  it('offers a retry when the preview cannot load', async () => {
    mockFetchPreview.mockRejectedValueOnce(new Error('offline'));
    await render(<DeleteAccountScreen onClose={onClose} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('What is deleted')).toBeTruthy();
    expect(mockFetchPreview).toHaveBeenCalledTimes(2);
  });

  it('closes from the banner without deleting anything', async () => {
    await renderLoaded();

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });
});
