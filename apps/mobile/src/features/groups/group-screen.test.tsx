import type { Balance, FriendSummary, GroupDetail, Transaction } from '@splitcount/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { friendsChanged } from '@/features/friends/friends-changed';
import { ApiError } from '@/lib/api/errors';

import { GroupScreen } from './group-screen';

const ada: FriendSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ada Lovelace',
  picture: null,
};

const grace: FriendSummary = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Grace Hopper',
  picture: null,
};

const trip: GroupDetail = {
  id: '33333333-3333-4333-8333-333333333333',
  kind: 'standard',
  name: 'Corsica 2026',
  memberCount: 2,
  parentId: null,
  depth: 0,
  subgroupCount: 0,
  archivedAt: null,
  createdAt: '2026-09-11T12:00:00.000Z',
  members: [
    { ...ada, role: 'owner' },
    { ...grace, role: 'member' },
  ],
  viewerRole: 'owner',
  subgroups: [],
  ancestors: [],
};

/** The implicit group two friends share: named after the other person. */
const pair: GroupDetail = {
  ...trip,
  id: '55555555-5555-4555-8555-555555555555',
  kind: 'pair',
  name: 'Grace Hopper',
  members: [
    { ...ada, role: 'member' },
    { ...grace, role: 'member' },
  ],
  viewerRole: 'member',
};

const groceries: Transaction = {
  id: '66666666-6666-4666-8666-666666666666',
  groupId: trip.id,
  kind: 'expense',
  title: 'Groceries',
  amountCents: 4250,
  occurredOn: '2026-09-11',
  comment: null,
  category: 'groceries',
  payer: ada,
  splitMode: 'shares',
  participants: [
    { user: ada, shareCents: 2125, weight: 1 },
    { user: grace, shareCents: 2125, weight: 1 },
  ],
  createdBy: ada.id,
  createdAt: '2026-09-11T12:00:00.000Z',
  updatedAt: '2026-09-11T12:00:00.000Z',
};

const balances: Balance[] = [
  { userId: ada.id, amountCents: 2125 },
  { userId: grace.id, amountCents: -2125 },
];

const mockFetchGroup = jest.fn<() => Promise<GroupDetail>>();
const mockFetchTransactions = jest.fn<() => Promise<Transaction[]>>();
const mockFetchBalances = jest.fn<() => Promise<Balance[]>>();
const mockCreateTransaction = jest.fn<() => Promise<Transaction>>();

const mockAuthContext = {
  authorizedFetch: jest.fn(),
  state: { status: 'signedIn', user: { ...ada, email: 'ada@example.com' } },
};

jest.mock('@/features/auth/use-auth', () => ({
  useAuth: () => mockAuthContext,
}));

jest.mock('@/lib/api/groups', () => ({
  fetchGroup: () => mockFetchGroup(),
  updateGroup: jest.fn(),
  deleteGroup: jest.fn(),
  addGroupMembers: jest.fn(),
  removeGroupMember: jest.fn(),
  fetchGroupInvite: jest.fn(),
  rotateGroupInvite: jest.fn(),
}));

jest.mock('@/lib/api/transactions', () => ({
  fetchTransactions: () => mockFetchTransactions(),
  fetchBalances: () => mockFetchBalances(),
  createTransaction: () => mockCreateTransaction(),
  updateTransaction: jest.fn(),
  deleteTransaction: jest.fn(),
}));

jest.mock('@/lib/api/friends', () => ({
  fetchFriends: async () => [],
  removeFriend: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

beforeEach(() => {
  mockFetchGroup.mockReset().mockResolvedValue(trip);
  mockFetchTransactions.mockReset().mockResolvedValue([]);
  mockFetchBalances.mockReset().mockResolvedValue([]);
  mockCreateTransaction.mockReset().mockResolvedValue(groceries);
});

async function openDetails() {
  await fireEvent.press(screen.getByRole('button', { name: 'Group details' }));
}

describe('GroupScreen', () => {
  it('shows the group name and its transactions', async () => {
    mockFetchTransactions.mockResolvedValue([groceries]);

    await render(<GroupScreen groupId={trip.id} />);

    expect(await screen.findByText('Corsica 2026')).toBeTruthy();
    // The category emoji renders next to the title.
    expect(await screen.findByText('🛒 Groceries')).toBeTruthy();
  });

  it('shows an empty state and an "Add a transaction" action', async () => {
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');

    expect(await screen.findByText(/No transactions yet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /add a transaction/i })).toBeTruthy();
  });

  it('opens the add-transaction form', async () => {
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');

    await fireEvent.press(screen.getByRole('button', { name: /add a transaction/i }));

    expect(await screen.findByLabelText('Title')).toBeTruthy();
  });

  it('opens the statistics on the transactions it already loaded', async () => {
    mockFetchTransactions.mockResolvedValue([groceries]);

    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');

    await fireEvent.press(screen.getByRole('button', { name: 'Group statistics' }));

    expect(await screen.findByTestId('statistics-centre-label')).toHaveTextContent(
      'Total spending',
    );
    // The list is read once by the screen: opening the sheet asks for nothing more.
    expect(mockFetchTransactions).toHaveBeenCalledTimes(1);
  });

  it('tells the Friends tab to reload after a transaction is saved', async () => {
    // A friend's per-group balance changed here has no other way to reach the
    // Friends tab's own per-friend total — it can only find out by asking.
    const notify = jest.spyOn(friendsChanged, 'notify');
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');

    await fireEvent.press(screen.getByRole('button', { name: /add a transaction/i }));
    await fireEvent.changeText(await screen.findByLabelText('Title'), 'Groceries');
    await fireEvent.changeText(screen.getByLabelText('Amount'), '10');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('🛒 Groceries')).toBeTruthy();
    expect(notify).toHaveBeenCalled();
  });

  it('keeps membership actions behind "Group details", alongside members and balances', async () => {
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');

    for (const action of [/add friends/i, /share an invitation link/i, /rename/i, /archive group/i]) {
      expect(screen.queryByRole('button', { name: action })).toBeNull();
    }

    await openDetails();

    expect(await screen.findByText('Grace Hopper')).toBeTruthy();
    for (const action of [/add friends/i, /share an invitation link/i, /rename/i, /archive group/i]) {
      expect(screen.getByRole('button', { name: action })).toBeTruthy();
    }
  });

  it('keeps deletion to the owner', async () => {
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');
    await openDetails();

    expect(await screen.findByRole('button', { name: /delete this group/i })).toBeTruthy();
    // The owner cannot strand the others.
    expect(screen.queryByRole('button', { name: /leave group/i })).toBeNull();
  });

  it('lets a plain member leave but not delete', async () => {
    mockFetchGroup.mockResolvedValue({ ...trip, viewerRole: 'member' });

    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');
    await openDetails();

    expect(await screen.findByRole('button', { name: /leave group/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /delete this group/i })).toBeNull();
  });

  it('hides "Add a transaction" and drops the membership actions of an archived group', async () => {
    mockFetchGroup.mockResolvedValue({ ...trip, archivedAt: '2026-09-12T12:00:00.000Z' });

    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');

    expect(screen.getByText(/Archived/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /add a transaction/i })).toBeNull();

    await openDetails();

    expect(await screen.findByRole('button', { name: /reopen group/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /add friends/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /share an invitation link/i })).toBeNull();
  });

  it('offers a transaction on a pair group exactly like a standard one', async () => {
    mockFetchGroup.mockResolvedValue(pair);

    await render(<GroupScreen groupId={pair.id} />);
    await screen.findByText('Grace Hopper');

    // Transactions are the one thing that behaves the same on a pair group.
    expect(await screen.findByRole('button', { name: /add a transaction/i })).toBeTruthy();
  });

  it('answers "where do I stand" on the screen itself, without opening the details', async () => {
    mockFetchGroup.mockResolvedValue(trip);
    mockFetchBalances.mockResolvedValue(balances);

    await render(<GroupScreen groupId={trip.id} />);

    // Ada is owed 21.25 — said in words, not left to a leading "+".
    expect(await screen.findByText('You are owed 21.25')).toBeTruthy();
  });

  it('states the viewer’s own side when they are the one owing', async () => {
    mockFetchGroup.mockResolvedValue(trip);
    mockFetchBalances.mockResolvedValue([
      { userId: ada.id, amountCents: -800 },
      { userId: grace.id, amountCents: 800 },
    ]);

    await render(<GroupScreen groupId={trip.id} />);

    expect(await screen.findByText('You owe 8.00')).toBeTruthy();
  });

  it('shows a pair group named after the other person, with no way to change who is in it', async () => {
    mockFetchGroup.mockResolvedValue(pair);
    mockFetchBalances.mockResolvedValue(balances);

    await render(<GroupScreen groupId={pair.id} />);
    await screen.findByText('Grace Hopper');
    await openDetails();

    // The other person names the group (header + details heading) *and*
    // appears in both the member list and the balances list.
    expect(await screen.findAllByText('Grace Hopper')).toHaveLength(4);
    // Absent, not disabled: none of these can ever apply to a pair group.
    for (const action of [
      /add friends/i,
      /share an invitation link/i,
      /rename/i,
      /archive group/i,
      /leave group/i,
      /delete this group/i,
    ]) {
      expect(screen.queryByRole('button', { name: action })).toBeNull();
    }
    expect(screen.getByText(/just the two of you/)).toBeTruthy();
  });

  it('says so when the group is gone', async () => {
    mockFetchGroup.mockRejectedValue(new ApiError(404, 'group_not_found'));

    await render(<GroupScreen groupId={trip.id} />);

    expect(await screen.findByText('This group is gone')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('offers a retry when the server cannot be reached', async () => {
    mockFetchGroup.mockRejectedValueOnce(new Error('offline'));

    await render(<GroupScreen groupId={trip.id} />);

    expect(await screen.findByText(/couldn’t load this group/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });
});
