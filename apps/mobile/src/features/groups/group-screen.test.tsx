import type {
  Balance,
  FriendSummary,
  GroupDetail,
  Invite,
  SubgroupSummary,
  Transaction,
  TransactionsListResponse,
} from '@splitcount/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { friendsChanged } from '@/features/friends/friends-changed';
import { ApiError } from '@/lib/api/errors';

import { GroupScreen } from './group-screen';
import { groupsChanged } from './groups-changed';

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
  viewerBalanceCents: 0,
  favorite: false,
  archivedAt: null,
  createdAt: '2026-09-11T12:00:00.000Z',
  members: [
    { ...ada, role: 'owner' },
    { ...grace, role: 'member' },
  ],
  viewerRole: 'owner',
  subgroups: [],
  ancestors: [],
  readOnly: false,
  pairRooted: false,
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
  pairRooted: true,
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
const mockFetchTransactions = jest.fn<() => Promise<TransactionsListResponse>>();
const mockFetchBalances = jest.fn<() => Promise<Balance[]>>();
const mockCreateTransaction = jest.fn<(...args: unknown[]) => Promise<Transaction>>();
const mockFriendList: unknown[] = [];
const mockJoinGroup = jest.fn<() => Promise<GroupDetail>>();
const mockFetchGroupInvite = jest.fn<() => Promise<Invite>>();
const mockSetGroupFavorite = jest.fn<(...args: unknown[]) => Promise<GroupDetail>>();
const mockUpdateGroup = jest.fn<(...args: unknown[]) => Promise<GroupDetail>>();
const mockPush = jest.fn();
const mockBack = jest.fn();

const mockAuthContext = {
  authorizedFetch: jest.fn(),
  state: { status: 'signedIn', user: { ...ada, email: 'ada@example.com' } },
};

jest.mock('@/features/auth/use-auth', () => ({
  useAuth: () => mockAuthContext,
}));

jest.mock('@/lib/api/groups', () => ({
  fetchGroup: () => mockFetchGroup(),
  createGroup: jest.fn(),
  updateGroup: (...args: unknown[]) => mockUpdateGroup(...args),
  deleteGroup: jest.fn(),
  addGroupMembers: jest.fn(),
  removeGroupMember: jest.fn(),
  joinGroup: () => mockJoinGroup(),
  setGroupFavorite: (...args: unknown[]) => mockSetGroupFavorite(...args),
  fetchGroupInvite: () => mockFetchGroupInvite(),
  rotateGroupInvite: jest.fn(),
}));

jest.mock('@/lib/api/transactions', () => ({
  fetchTransactions: () => mockFetchTransactions(),
  fetchBalances: () => mockFetchBalances(),
  createTransaction: (...args: unknown[]) => mockCreateTransaction(...args),
  updateTransaction: jest.fn(),
  deleteTransaction: jest.fn(),
}));

jest.mock('@/lib/api/friends', () => ({
  fetchFriends: async () => mockFriendList,
  removeFriend: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

beforeEach(() => {
  mockFetchGroup.mockReset().mockResolvedValue(trip);
  mockFetchTransactions.mockReset().mockResolvedValue({
    transactions: [],
    excludedSubgroupCount: 0,
  });
  mockFetchBalances.mockReset().mockResolvedValue([]);
  mockCreateTransaction.mockReset().mockResolvedValue(groceries);
  mockJoinGroup.mockReset().mockResolvedValue(trip);
  mockFetchGroupInvite.mockReset().mockResolvedValue({
    code: 'abc',
    url: 'https://api.test/i/abc',
    expiresAt: '2026-09-30T12:00:00.000Z',
  });
  mockSetGroupFavorite.mockReset().mockResolvedValue({ ...trip, favorite: true });
  mockUpdateGroup.mockReset().mockResolvedValue(trip);
  mockPush.mockReset();
  mockBack.mockReset();
});

/** Switch the page to one of its tabs. */
async function openTab(name: 'Transactions' | 'Balances' | 'Statistics' | 'Manage') {
  await fireEvent.press(screen.getByRole('tab', { name }));
}

describe('GroupScreen', () => {
  it('shows the group name and its transactions', async () => {
    mockFetchTransactions.mockResolvedValue({
      transactions: [groceries],
      excludedSubgroupCount: 0,
    });

    await render(<GroupScreen groupId={trip.id} />);

    expect(await screen.findByText('Corsica 2026')).toBeTruthy();
    // The category emoji renders next to the title.
    expect(await screen.findByText('Groceries')).toBeTruthy();
  });

  it('toggles the group’s own favorite from the header', async () => {
    // The mutation's own response applies immediately; a follow-up refetch
    // (triggered by `groupsChanged.notify()`) must agree with it rather than
    // clobber it back — set up both calls to reflect that.
    mockFetchGroup.mockResolvedValueOnce(trip).mockResolvedValue({ ...trip, favorite: true });

    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');

    await fireEvent.press(screen.getByRole('button', { name: 'Add Corsica 2026 to favorites' }));

    expect(mockSetGroupFavorite).toHaveBeenCalledWith(expect.anything(), trip.id, true);
    expect(
      await screen.findByRole('button', { name: 'Remove Corsica 2026 from favorites' }),
    ).toBeTruthy();
  });

  it('lets a pair group be favorited too, from its own page', async () => {
    mockFetchGroup.mockResolvedValueOnce(pair).mockResolvedValue({ ...pair, favorite: true });

    await render(<GroupScreen groupId={pair.id} />);
    await screen.findByText('Grace Hopper');

    await fireEvent.press(screen.getByRole('button', { name: 'Add Grace Hopper to favorites' }));

    expect(mockSetGroupFavorite).toHaveBeenCalledWith(expect.anything(), pair.id, true);
    expect(
      await screen.findByRole('button', { name: 'Remove Grace Hopper from favorites' }),
    ).toBeTruthy();
  });

  it('names the group and counts its members in a header of its own', async () => {
    await render(<GroupScreen groupId={trip.id} />);

    expect(await screen.findByText('Corsica 2026')).toBeTruthy();
    expect(screen.getByText('· 2 members')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(mockBack).toHaveBeenCalled();
  });

  it('opens on Transactions, with Balances, Statistics and Manage beside it', async () => {
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');

    for (const name of ['Transactions', 'Balances', 'Statistics', 'Manage']) {
      expect(screen.getByRole('tab', { name })).toBeTruthy();
    }
    expect(
      screen.getByRole('tab', { name: 'Transactions' }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    // Sub-groups and transactions share the default tab; nothing else's content is up.
    expect(screen.getByText('Sub-groups')).toBeTruthy();
    expect(screen.queryByText('Your balance here')).toBeNull();
    expect(screen.queryByText('Total spending')).toBeNull();
  });

  it('swipes sideways between its tabs, and not past the first one', async () => {
    const swipe = async (translationX: number) => {
      await act(async () => {
        fireGestureHandler(getByGestureTestId('pager'), [
          { state: State.BEGAN, translationX: 0 },
          { state: State.ACTIVE, translationX: translationX / 2 },
          { state: State.END, translationX },
        ]);
      });
    };
    const selected = (name: string) =>
      screen.getByRole('tab', { name }).props.accessibilityState.selected;

    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');

    await swipe(-400);
    await waitFor(() => expect(selected('Balances')).toBe(true));
    expect(await screen.findByText('You’re all settled up')).toBeTruthy();

    await swipe(400);
    await waitFor(() => expect(selected('Transactions')).toBe(true));

    await swipe(400);
    expect(selected('Transactions')).toBe(true);
  });

  it('can open straight onto another tab', async () => {
    await render(<GroupScreen groupId={trip.id} initialTab="manage" />);

    expect(await screen.findByRole('button', { name: 'Invite' })).toBeTruthy();
    expect(screen.queryByText('Sub-groups')).toBeNull();
  });

  it('shows an empty state and an "Add a transaction" action', async () => {
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');

    expect(await screen.findByText(/No transactions yet/)).toBeTruthy();
    // The tab, and the section's own title under the sub-groups above it.
    expect(screen.getAllByText('Transactions')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /add a transaction/i })).toBeTruthy();
  });

  it('opens the add-transaction form', async () => {
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');

    await fireEvent.press(screen.getByRole('button', { name: /add a transaction/i }));

    expect(await screen.findByLabelText('Title')).toBeTruthy();
  });

  it('opens the statistics, which fetch their own data', async () => {
    mockFetchTransactions.mockResolvedValue({
      transactions: [groceries],
      excludedSubgroupCount: 0,
    });

    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');

    await openTab('Statistics');

    expect(await screen.findByTestId('statistics-centre-label')).toHaveTextContent(
      'Total spending',
    );
    // The statistics view defaults to including sub-groups — a scope the
    // plain transaction list never requests — so it fetches on its own
    // rather than reusing the list's call (docs/specs/group-statistics.md).
    expect(mockFetchTransactions).toHaveBeenCalledTimes(2);
  });

  it('shows the reimbursement plan and everyone’s balance on the Balances tab', async () => {
    mockFetchBalances.mockResolvedValue(balances);

    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');

    await openTab('Balances');

    expect(await screen.findByRole('button', { name: 'Grace Hopper pays you 21.25' })).toBeTruthy();
    expect(screen.getByText('Where everyone stands')).toBeTruthy();
  });

  it('pre-fills a transfer from a suggested reimbursement', async () => {
    mockFetchBalances.mockResolvedValue(balances);

    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');
    await openTab('Balances');

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Grace Hopper pays you 21.25' }),
    );

    // The transfer form, with the payment already written out: the amount,
    // and Grace — not the viewer — as the payer.
    expect(await screen.findByLabelText('Title')).toHaveProp('value', 'Reimbursement');
    expect(screen.getByLabelText('Amount')).toHaveProp('value', '21.25');
    expect(screen.getByRole('button', { name: 'Transfer' }).props.accessibilityState).toMatchObject(
      { selected: true },
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    // Grace pays Ada — the payer is the debtor the plan named, not the
    // viewer who happened to tap it.
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.anything(),
      trip.id,
      expect.objectContaining({
        kind: 'transfer',
        title: 'Reimbursement',
        amount: 2125,
        payerId: grace.id,
        toUserId: ada.id,
      }),
    );
  });

  it('is back on the plan once the reimbursement is recorded', async () => {
    mockFetchBalances.mockResolvedValue(balances);

    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');
    await openTab('Balances');
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Grace Hopper pays you 21.25' }),
    );

    // Saving refreshes the balances the plan is derived from; nothing is
    // owed any more, so the plan it returns to reads as settled.
    mockFetchBalances.mockResolvedValue([
      { userId: ada.id, amountCents: 0 },
      { userId: grace.id, amountCents: 0 },
    ]);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    // The plan's own settled state, not the group screen's balance line —
    // both say "settled up", only this one says who to.
    expect(await screen.findByText('Nobody owes anybody here.')).toBeTruthy();
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

    expect(await screen.findByText('Groceries')).toBeTruthy();
    expect(notify).toHaveBeenCalled();
  });

  it('keeps the members and management actions on the Manage tab', async () => {
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');

    for (const action of [/invite/i, /archive group/i]) {
      expect(screen.queryByRole('button', { name: action })).toBeNull();
    }
    expect(screen.queryByDisplayValue('Corsica 2026')).toBeNull();

    await openTab('Manage');

    expect(await screen.findByText('Grace Hopper')).toBeTruthy();
    expect(screen.getByText('Members (2)')).toBeTruthy();
    expect(screen.getByDisplayValue('Corsica 2026')).toBeTruthy();
    for (const action of [/invite/i, /archive group/i]) {
      expect(screen.getByRole('button', { name: action })).toBeTruthy();
    }
  });

  it('shows no icon at all until the field is focused, then just a checkmark', async () => {
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');
    await openTab('Manage');

    expect(screen.getByText('Group name')).toBeTruthy();
    const field = screen.getByDisplayValue('Corsica 2026');
    expect(field.props.editable).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save group name' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard change' })).toBeNull();

    await fireEvent(field, 'focus');

    // The checkmark shows as soon as the field is focused, even before
    // anything has actually been typed — but there's nothing to discard yet.
    expect(screen.getByRole('button', { name: 'Save group name' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Discard change' })).toBeNull();
  });

  it('only shows the discard cross once the name actually differs from the saved one', async () => {
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');
    await openTab('Manage');

    const field = screen.getByDisplayValue('Corsica 2026');
    await fireEvent(field, 'focus');
    expect(screen.queryByRole('button', { name: 'Discard change' })).toBeNull();

    await fireEvent.changeText(field, 'Corsica Trip');
    expect(screen.getByRole('button', { name: 'Discard change' })).toBeTruthy();

    await fireEvent.changeText(field, 'Corsica 2026');
    expect(screen.queryByRole('button', { name: 'Discard change' })).toBeNull();
  });

  it('commits the new name on the checkmark, then its icons fade away', async () => {
    mockUpdateGroup.mockResolvedValue({ ...trip, name: 'Corsica Trip' });
    // The background refetch that `groupsChanged` triggers races the direct
    // `set()` from the rename response — give it the same fresh name, the
    // way a real server would (see the favorite-toggle test above).
    mockFetchGroup.mockResolvedValueOnce(trip).mockResolvedValue({ ...trip, name: 'Corsica Trip' });

    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');
    await openTab('Manage');

    const field = screen.getByDisplayValue('Corsica 2026');
    await fireEvent(field, 'focus');
    await fireEvent.changeText(field, 'Corsica Trip');
    await fireEvent.press(screen.getByRole('button', { name: 'Save group name' }));

    expect(mockUpdateGroup).toHaveBeenCalledWith(expect.anything(), trip.id, {
      name: 'Corsica Trip',
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Save group name' })).toBeNull();
    });
    expect(screen.queryByRole('button', { name: 'Discard change' })).toBeNull();
    expect(screen.getByDisplayValue('Corsica Trip')).toBeTruthy();
  });

  it('also commits on the keyboard’s own submit', async () => {
    mockUpdateGroup.mockResolvedValue({ ...trip, name: 'Corsica Trip' });
    mockFetchGroup.mockResolvedValueOnce(trip).mockResolvedValue({ ...trip, name: 'Corsica Trip' });

    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');
    await openTab('Manage');

    const field = screen.getByDisplayValue('Corsica 2026');
    await fireEvent(field, 'focus');
    await fireEvent.changeText(field, 'Corsica Trip');
    await fireEvent(field, 'submitEditing');

    expect(mockUpdateGroup).toHaveBeenCalledWith(expect.anything(), trip.id, {
      name: 'Corsica Trip',
    });
  });

  it('does not save or discard on blur — the draft and its icons stay put, and the unsaved hint arrives after a short delay', async () => {
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');
    await openTab('Manage');

    const field = screen.getByDisplayValue('Corsica 2026');
    await fireEvent(field, 'focus');
    await fireEvent.changeText(field, 'Corsica Trip');
    expect(screen.queryByText('Change not saved yet')).toBeNull();

    await fireEvent(field, 'blur');

    expect(mockUpdateGroup).not.toHaveBeenCalled();
    // Blurring neither saved nor discarded — the typed draft is exactly
    // what's still there, and its icons stay up too, since the name is still
    // un-validated. The hint itself waits a beat rather than showing the
    // instant focus goes.
    expect(screen.getByDisplayValue('Corsica Trip')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save group name' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Discard change' })).toBeTruthy();
    expect(screen.queryByText('Change not saved yet')).toBeNull();
    await waitFor(() => {
      expect(screen.getByText('Change not saved yet')).toBeTruthy();
    });
  });

  it('never shows the unsaved hint if the field is refocused before its delay elapses', async () => {
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');
    await openTab('Manage');

    const field = screen.getByDisplayValue('Corsica 2026');
    await fireEvent(field, 'focus');
    await fireEvent.changeText(field, 'Corsica Trip');
    await fireEvent(field, 'blur');
    await fireEvent(field, 'focus');

    // Long enough that the hint's own delay would have elapsed had it not
    // been cancelled by the refocus.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    expect(screen.queryByText('Change not saved yet')).toBeNull();
  });

  it('hides the unsaved hint again once the field is refocused', async () => {
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');
    await openTab('Manage');

    const field = screen.getByDisplayValue('Corsica 2026');
    await fireEvent(field, 'focus');
    await fireEvent.changeText(field, 'Corsica Trip');
    await fireEvent(field, 'blur');
    await waitFor(() => {
      expect(screen.getByText('Change not saved yet')).toBeTruthy();
    });

    await fireEvent(field, 'focus');

    expect(screen.queryByText('Change not saved yet')).toBeNull();
    expect(screen.getByDisplayValue('Corsica Trip')).toBeTruthy();
  });

  it('clears the unsaved hint and its icons once the name is typed back to its saved value', async () => {
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');
    await openTab('Manage');

    const field = screen.getByDisplayValue('Corsica 2026');
    await fireEvent(field, 'focus');
    await fireEvent.changeText(field, 'Corsica Trip');
    await fireEvent(field, 'blur');
    await waitFor(() => {
      expect(screen.getByText('Change not saved yet')).toBeTruthy();
    });

    await fireEvent(field, 'focus');
    await fireEvent.changeText(field, 'Corsica 2026');
    await fireEvent(field, 'blur');

    expect(screen.queryByText('Change not saved yet')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save group name' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard change' })).toBeNull();
  });

  it('treats a blank name as a discard rather than sending it', async () => {
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');
    await openTab('Manage');

    const field = screen.getByDisplayValue('Corsica 2026');
    await fireEvent(field, 'focus');
    await fireEvent.changeText(field, '');
    await fireEvent.press(screen.getByRole('button', { name: 'Save group name' }));

    expect(mockUpdateGroup).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Corsica 2026')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save group name' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard change' })).toBeNull();
  });

  it('discards the draft and its icons fade away when reset is pressed', async () => {
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');
    await openTab('Manage');

    const field = screen.getByDisplayValue('Corsica 2026');
    await fireEvent(field, 'focus');
    await fireEvent.changeText(field, 'Corsica Trip');
    await fireEvent.press(screen.getByRole('button', { name: 'Discard change' }));

    expect(screen.getByDisplayValue('Corsica 2026')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save group name' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard change' })).toBeNull();
    expect(mockUpdateGroup).not.toHaveBeenCalled();
  });

  it('lists the owner first regardless of the server’s own member order', async () => {
    mockFetchGroup.mockResolvedValue({
      ...trip,
      members: [
        { ...grace, role: 'member' },
        { ...ada, role: 'owner' },
      ],
    });

    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');
    await openTab('Manage');

    const names = await screen.findAllByText(/Lovelace|Hopper/);
    expect(names[0]).toHaveTextContent('Ada Lovelace');
    expect(names[1]).toHaveTextContent('Grace Hopper');
  });

  it('puts the friend picker and the invitation link on one "+ Invite" page', async () => {
    mockFetchGroupInvite.mockResolvedValue({
      code: 'abc',
      url: 'https://api.test/i/abc',
      expiresAt: '2026-09-30T12:00:00.000Z',
    });
    await render(<GroupScreen groupId={trip.id} initialTab="manage" />);

    // Neither is on the tab itself.
    expect(screen.queryByRole('button', { name: /add to group/i })).toBeNull();
    expect(screen.queryByText('https://api.test/i/abc')).toBeNull();

    await fireEvent.press(await screen.findByRole('button', { name: 'Invite' }));

    // Both are on the page at once, with no menu in between.
    expect(await screen.findByRole('button', { name: /add to group/i })).toBeTruthy();
    expect(await screen.findByText('https://api.test/i/abc')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();

    // It replaces the Manage tab's content in place — the tabs stay — and
    // "Done" brings the members back.
    expect(screen.queryByRole('button', { name: 'Invite' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Manage' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('button', { name: 'Invite' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /add to group/i })).toBeNull();
  });

  it('lists friends already in the group ticked and disabled, and counts the picked ones', async () => {
    mockFriendList.push({ ...grace, groupId: pair.id, favorite: false });
    try {
      await render(<GroupScreen groupId={trip.id} initialTab="manage" />);
      await fireEvent.press(await screen.findByRole('button', { name: 'Invite' }));

      const row = await screen.findByRole('checkbox', { name: 'Grace Hopper' });
      expect(row).toBeDisabled();
      expect(row).toBeChecked();
      expect(screen.getByText('0 selected')).toBeTruthy();
    } finally {
      mockFriendList.length = 0;
    }
  });

  it('keeps deletion to the owner', async () => {
    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');
    await openTab('Manage');

    expect(await screen.findByRole('button', { name: /delete group/i })).toBeTruthy();
    // The owner cannot strand the others.
    expect(screen.queryByRole('button', { name: /leave group/i })).toBeNull();
  });

  it('lets a plain member leave but not delete', async () => {
    mockFetchGroup.mockResolvedValue({ ...trip, viewerRole: 'member' });

    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');
    await openTab('Manage');

    expect(await screen.findByRole('button', { name: /leave group/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /delete group/i })).toBeNull();
  });

  it('hides "Add a transaction" and drops the membership actions of an archived group', async () => {
    mockFetchGroup.mockResolvedValue({
      ...trip,
      archivedAt: '2026-09-12T12:00:00.000Z',
      readOnly: true,
    });

    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');

    expect(screen.getByText(/Archived/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /add a transaction/i })).toBeNull();

    await openTab('Manage');

    expect(await screen.findByRole('button', { name: /reopen group/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Invite' })).toBeNull();
  });

  it('offers a transaction on a pair group exactly like a standard one', async () => {
    mockFetchGroup.mockResolvedValue(pair);

    await render(<GroupScreen groupId={pair.id} />);
    await screen.findByText('Grace Hopper');

    // Transactions are the one thing that behaves the same on a pair group.
    expect(await screen.findByRole('button', { name: /add a transaction/i })).toBeTruthy();
  });

  it('marks the viewer’s own row “Me” in “Where everyone stands”', async () => {
    mockFetchGroup.mockResolvedValue(trip);
    mockFetchBalances.mockResolvedValue(balances);

    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');
    await openTab('Balances');

    await screen.findByText('Where everyone stands');
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('Me')).toBeTruthy();
    expect(screen.getByText('+21.25')).toBeTruthy();
  });

  it('states the viewer’s own side when they are the one owing', async () => {
    mockFetchGroup.mockResolvedValue({ ...trip, viewerBalanceCents: -800 });
    mockFetchBalances.mockResolvedValue([
      { userId: ada.id, amountCents: -800 },
      { userId: grace.id, amountCents: 800 },
    ]);

    await render(<GroupScreen groupId={trip.id} />);
    await screen.findByText('Corsica 2026');
    await openTab('Balances');

    expect(await screen.findByText('−8.00')).toBeTruthy();
  });

  it('shows a pair group named after the other person, with no way to change who is in it', async () => {
    mockFetchGroup.mockResolvedValue(pair);
    mockFetchBalances.mockResolvedValue(balances);

    await render(<GroupScreen groupId={pair.id} />);
    await screen.findByText('Grace Hopper');
    await openTab('Manage');

    // The other person names the group (header) *and* is in the member list.
    expect(await screen.findAllByText('Grace Hopper')).toHaveLength(2);
    // Absent, not disabled: none of these can ever apply to a pair group.
    for (const action of [
      /invite/i,
      /rename group/i,
      /save group name/i,
      /discard change/i,
      /archive group/i,
      /leave group/i,
      /delete group/i,
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

  describe('sub-groups', () => {
    const joinedSub: SubgroupSummary = {
      id: '77777777-7777-4777-8777-777777777777',
      name: 'Ajaccio weekend',
      memberCount: 2,
      viewerIsMember: true,
      viewerBalanceCents: -1250,
      favorite: false,
      viewerRole: 'owner',
      archivedAt: null,
    };

    const unjoinedSub: SubgroupSummary = {
      id: '88888888-8888-4888-8888-888888888888',
      name: 'Bastia weekend',
      memberCount: 1,
      viewerIsMember: false,
      viewerBalanceCents: 0,
      favorite: false,
      viewerRole: null,
      archivedAt: null,
    };

    it('shows a joined sub-group and opens it directly', async () => {
      mockFetchGroup.mockResolvedValue({ ...trip, subgroups: [joinedSub], subgroupCount: 1 });

      await render(<GroupScreen groupId={trip.id} />);
      await fireEvent.press(await screen.findByText('Ajaccio weekend'));

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/groups/[id]',
        params: { id: joinedSub.id },
      });
      expect(mockJoinGroup).not.toHaveBeenCalled();
    });

    it('toggles a joined sub-group’s own favorite, independent of this group’s', async () => {
      // A sub-group's own toggle has no response to apply directly (it
      // targets a different group than the one this screen shows) — it
      // relies entirely on the `groupsChanged`-triggered refetch, so the
      // second call must reflect the change.
      mockFetchGroup
        .mockResolvedValueOnce({ ...trip, subgroups: [joinedSub], subgroupCount: 1 })
        .mockResolvedValue({
          ...trip,
          subgroups: [{ ...joinedSub, favorite: true }],
          subgroupCount: 1,
        });

      await render(<GroupScreen groupId={trip.id} />);
      await screen.findByText('Ajaccio weekend');

      await fireEvent.press(
        screen.getByRole('button', { name: 'Add Ajaccio weekend to favorites' }),
      );

      expect(mockSetGroupFavorite).toHaveBeenCalledWith(expect.anything(), joinedSub.id, true);
      expect(
        await screen.findByRole('button', { name: 'Remove Ajaccio weekend from favorites' }),
      ).toBeTruthy();
    });

    it('shows a joined sub-group’s own balance', async () => {
      mockFetchGroup.mockResolvedValue({ ...trip, subgroups: [joinedSub], subgroupCount: 1 });

      await render(<GroupScreen groupId={trip.id} />);

      expect(await screen.findByText('You owe 12.50')).toBeTruthy();
    });

    it('offers a joined sub-group its own "⋮" actions menu, opening Manage onto its Manage tab', async () => {
      mockFetchGroup.mockResolvedValue({ ...trip, subgroups: [joinedSub], subgroupCount: 1 });

      await render(<GroupScreen groupId={trip.id} />);
      await screen.findByText('Ajaccio weekend');
      await fireEvent.press(screen.getByRole('button', { name: 'Actions for Ajaccio weekend' }));

      // The menu's own row — the page's "Manage" tab is a tab, not a button.
      expect(screen.getByRole('button', { name: 'Manage' })).toBeTruthy();
      expect(screen.getByText('Delete group')).toBeTruthy();

      await fireEvent.press(screen.getByRole('button', { name: 'Manage' }));

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/groups/[id]',
        params: { id: joinedSub.id, tab: 'manage' },
      });
    });

    it('gives an unjoined sub-group no actions menu — nothing to manage there', async () => {
      mockFetchGroup.mockResolvedValue({
        ...trip,
        subgroups: [joinedSub, unjoinedSub],
        subgroupCount: 2,
      });

      await render(<GroupScreen groupId={trip.id} />);
      await screen.findByText('Ajaccio weekend');
      await fireEvent.press(screen.getByText('Show sub-groups I’m not in (1)'));
      await screen.findByText('Bastia weekend');

      expect(screen.queryByRole('button', { name: 'Actions for Bastia weekend' })).toBeNull();
    });

    it('hides an unjoined sub-group behind a toggle', async () => {
      mockFetchGroup.mockResolvedValue({
        ...trip,
        subgroups: [joinedSub, unjoinedSub],
        subgroupCount: 2,
      });

      await render(<GroupScreen groupId={trip.id} />);
      await screen.findByText('Ajaccio weekend');

      expect(screen.queryByText('Bastia weekend')).toBeNull();
      expect(screen.getByText('Show sub-groups I’m not in (1)')).toBeTruthy();

      await fireEvent.press(screen.getByText('Show sub-groups I’m not in (1)'));

      expect(await screen.findByText('Bastia weekend')).toBeTruthy();
      expect(screen.getByText(/not joined/)).toBeTruthy();
    });

    it('asks for confirmation before joining an unjoined sub-group', async () => {
      mockFetchGroup.mockResolvedValue({ ...trip, subgroups: [unjoinedSub], subgroupCount: 1 });

      await render(<GroupScreen groupId={trip.id} />);
      await fireEvent.press(screen.getByText('Show sub-groups I’m not in (1)'));
      await fireEvent.press(await screen.findByText('Bastia weekend'));

      expect(await screen.findByText('Join this group?')).toBeTruthy();
      expect(screen.getByText(/Join “Bastia weekend”/)).toBeTruthy();
      expect(mockJoinGroup).not.toHaveBeenCalled();
    });

    it('joins and navigates once confirmed', async () => {
      mockFetchGroup.mockResolvedValue({ ...trip, subgroups: [unjoinedSub], subgroupCount: 1 });

      await render(<GroupScreen groupId={trip.id} />);
      await fireEvent.press(screen.getByText('Show sub-groups I’m not in (1)'));
      await fireEvent.press(await screen.findByText('Bastia weekend'));
      await fireEvent.press(await screen.findByRole('button', { name: 'Join' }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith({
          pathname: '/groups/[id]',
          params: { id: unjoinedSub.id },
        });
      });
      expect(mockJoinGroup).toHaveBeenCalled();
    });

    it('offers sub-groups on a pair group too, just like a standard one', async () => {
      mockFetchGroup.mockResolvedValue(pair);

      await render(<GroupScreen groupId={pair.id} />);
      await screen.findByText('Grace Hopper');

      expect(screen.getByText('Sub-groups')).toBeTruthy();
      expect(screen.getByText('+ Create')).toBeTruthy();
    });

    it('hides "+ Invite" for a sub-group nested under a pair group', async () => {
      mockFetchGroup.mockResolvedValue({ ...trip, pairRooted: true });

      await render(<GroupScreen groupId={trip.id} initialTab="manage" />);
      await screen.findByDisplayValue('Corsica 2026');

      expect(screen.queryByRole('button', { name: 'Invite' })).toBeNull();
      expect(
        screen.getByText('Just the two of you here too — no one else can be added.'),
      ).toBeTruthy();
    });

    it('skips the friend picker when creating a sub-group under a pair-rooted group', async () => {
      mockFetchGroup.mockResolvedValue({ ...trip, pairRooted: true });

      await render(<GroupScreen groupId={trip.id} />);
      await fireEvent.press(await screen.findByText('+ Create'));

      expect(await screen.findByText('New group')).toBeTruthy();
      expect(
        screen.getByText('Just the two of you here too — no one else can be added.'),
      ).toBeTruthy();
      expect(screen.queryByText('Add friends now, or share a link later.')).toBeNull();
    });

    it('shows a breadcrumb of ancestors and opens one when tapped', async () => {
      mockFetchGroup.mockResolvedValue({
        ...trip,
        name: 'Ajaccio weekend',
        ancestors: [{ id: 'root-id', name: 'Corsica 2026' }],
      });

      await render(<GroupScreen groupId={trip.id} />);
      await fireEvent.press(await screen.findByText('Corsica 2026'));

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/groups/[id]',
        params: { id: 'root-id' },
      });
    });

    it('opens the create-sub-group screen from the sub-groups section', async () => {
      await render(<GroupScreen groupId={trip.id} />);
      await fireEvent.press(await screen.findByText('+ Create'));

      expect(await screen.findByText('New group')).toBeTruthy();
    });

    it('reloads its subgroups when notified — e.g. right after creating one', async () => {
      await render(<GroupScreen groupId={trip.id} />);
      await screen.findByText('Corsica 2026');
      expect(mockFetchGroup).toHaveBeenCalledTimes(1);

      mockFetchGroup.mockResolvedValue({ ...trip, subgroups: [joinedSub], subgroupCount: 1 });
      await act(async () => {
        groupsChanged.notify();
      });

      expect(await screen.findByText('Ajaccio weekend')).toBeTruthy();
      expect(mockFetchGroup).toHaveBeenCalledTimes(2);
    });
  });
});
