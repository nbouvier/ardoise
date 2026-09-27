import type {
  Transaction,
  TransactionCategory,
  TransactionKind,
  TransactionsListResponse,
} from '@splitcount/shared';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { StatisticsScreen } from './statistics-screen';

const ada = { id: 'ada', name: 'Ada Lovelace', picture: null };
const grace = { id: 'grace', name: 'Grace Hopper', picture: null };
const members = [
  { ...ada, role: 'member' as const },
  { ...grace, role: 'member' as const },
];

const subgroupFixture = (id: string, name: string) => ({
  id,
  name,
  memberCount: 2,
  viewerIsMember: true,
  viewerBalanceCents: 0,
  favorite: false,
  viewerRole: 'member' as const,
  archivedAt: null,
});
const subOne = subgroupFixture('sub-1', 'Ajaccio weekend');
const subTwo = subgroupFixture('sub-2', 'Bastia weekend');

let sequence = 0;

function transaction({
  kind = 'expense' as TransactionKind,
  category = 'other' as TransactionCategory,
  amountCents,
  shares,
  occurredOn = '2026-01-01',
}: {
  kind?: TransactionKind;
  category?: TransactionCategory;
  amountCents: number;
  shares?: { ada?: number; grace?: number };
  occurredOn?: string;
}): Transaction {
  sequence += 1;
  const split = shares ?? { ada: amountCents };

  return {
    id: `tx-${sequence}`,
    groupId: 'group',
    kind,
    title: 'Something',
    amountCents,
    occurredOn,
    comment: null,
    category,
    payer: ada,
    splitMode: 'amount',
    participants: [
      ...(split.ada === undefined ? [] : [{ user: ada, shareCents: split.ada, weight: null }]),
      ...(split.grace === undefined
        ? []
        : [{ user: grace, shareCents: split.grace, weight: null }]),
    ],
    createdBy: ada.id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const mockFetchTransactions = jest.fn<() => Promise<TransactionsListResponse>>();
// Stable across renders, like the real memoised auth context — a fresh object
// per call would make authorizedFetch a new reference every render, which
// use-transactions.ts's effect depends on, looping forever.
const mockAuthContext = { authorizedFetch: jest.fn() };

jest.mock('@/features/auth/use-auth', () => ({
  useAuth: () => mockAuthContext,
}));

jest.mock('@/lib/api/transactions', () => ({
  fetchTransactions: () => mockFetchTransactions(),
}));

beforeEach(() => {
  mockFetchTransactions.mockReset();
});

/** Participants, subgroups and the date range live behind "More options", closed by default. */
async function openMoreOptions() {
  await fireEvent.press(screen.getByRole('button', { name: 'More options' }));
}

async function renderScreen(
  transactions: Transaction[],
  overrides: Partial<Parameters<typeof StatisticsScreen>[0]> = {},
) {
  mockFetchTransactions.mockResolvedValue({ transactions, excludedSubgroupCount: 0 });
  return render(
    <StatisticsScreen
      groupId="group-1"
      subgroups={[]}
      members={members}
      viewerId={ada.id}
      {...overrides}
    />,
  );
}

describe('StatisticsScreen', () => {
  it('shows the group’s spending total and a legend row per category', async () => {
    await renderScreen([
      transaction({ category: 'groceries', amountCents: 3000 }),
      transaction({ category: 'travel', amountCents: 1000 }),
    ]);

    expect(await screen.findByTestId('statistics-centre-amount')).toHaveTextContent('40.00');
    expect(screen.getByTestId('statistics-centre-label')).toHaveTextContent('Total spending');
    expect(screen.getByRole('button', { name: 'Groceries, 30.00, 75%' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Travel, 10.00, 25%' })).toBeTruthy();
  });

  it('draws one arc per category', async () => {
    await renderScreen([
      transaction({ category: 'groceries', amountCents: 3000 }),
      transaction({ category: 'travel', amountCents: 1000 }),
    ]);

    expect(await screen.findByTestId('donut-slice-groceries')).toBeTruthy();
    expect(screen.getByTestId('donut-slice-travel')).toBeTruthy();
    expect(screen.queryByTestId('donut-slice-housing')).toBeNull();
  });

  it('leaves transfers out of the total', async () => {
    await renderScreen([
      transaction({ category: 'groceries', amountCents: 3000 }),
      transaction({ kind: 'transfer', category: 'groceries', amountCents: 5000 }),
    ]);

    expect(await screen.findByTestId('statistics-centre-amount')).toHaveTextContent('30.00');
  });

  it('switches to the group’s income', async () => {
    await renderScreen([
      transaction({ category: 'groceries', amountCents: 3000 }),
      transaction({ kind: 'income', category: 'gifts', amountCents: 800 }),
    ]);
    await screen.findByTestId('statistics-centre-amount');

    await fireEvent.press(screen.getByRole('button', { name: 'Income' }));

    expect(screen.getByTestId('statistics-centre-label')).toHaveTextContent('Total income');
    expect(screen.getByTestId('statistics-centre-amount')).toHaveTextContent('8.00');
    expect(screen.queryByTestId('donut-slice-groceries')).toBeNull();
  });

  it('narrows to a single participant’s own share when the others are deselected', async () => {
    await renderScreen([
      transaction({
        category: 'restaurant',
        amountCents: 3000,
        shares: { ada: 1000, grace: 2000 },
      }),
    ]);

    expect(await screen.findByTestId('statistics-centre-amount')).toHaveTextContent('30.00');

    await openMoreOptions();
    await fireEvent.press(screen.getByRole('button', { name: /Participants:/ }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Grace Hopper' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByTestId('statistics-centre-amount')).toHaveTextContent('10.00');
  });

  it('sums the shares of every selected participant', async () => {
    await renderScreen([
      transaction({
        category: 'restaurant',
        amountCents: 3000,
        shares: { ada: 1000, grace: 2000 },
      }),
    ]);
    await screen.findByTestId('statistics-centre-amount');

    await openMoreOptions();
    await fireEvent.press(screen.getByRole('button', { name: /Participants:/ }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Grace Hopper' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Grace Hopper' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByTestId('statistics-centre-amount')).toHaveTextContent('30.00');
  });

  it('explains that no participant is selected rather than drawing an empty ring', async () => {
    await renderScreen([transaction({ category: 'groceries', amountCents: 3000 })]);
    await screen.findByTestId('statistics-centre-amount');

    await openMoreOptions();
    await fireEvent.press(screen.getByRole('button', { name: /Participants:/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Nobody' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByText(/Select at least one participant/)).toBeTruthy();
  });

  it('names the field by who is selected, and opens a checklist to change it', async () => {
    await renderScreen([transaction({ category: 'groceries', amountCents: 3000 })]);
    await screen.findByTestId('statistics-centre-amount');

    await openMoreOptions();
    expect(screen.getByRole('button', { name: 'Participants: Everybody' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Participants: Everybody' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Grace Hopper' }));

    const graceOption = screen.getByRole('checkbox', { name: 'Grace Hopper' });
    expect(graceOption.props.accessibilityState).toMatchObject({ checked: false });

    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByRole('button', { name: 'Participants: Ada' })).toBeTruthy();
  });

  it('marks the viewer’s own row “Me” in the participant checklist', async () => {
    await renderScreen([transaction({ category: 'groceries', amountCents: 3000 })]);
    await screen.findByTestId('statistics-centre-amount');

    await openMoreOptions();
    await fireEvent.press(screen.getByRole('button', { name: /Participants:/ }));

    expect(screen.getByText('Me')).toBeTruthy();
  });

  it('offers quick presets for everybody, nobody and only the viewer', async () => {
    await renderScreen([
      transaction({
        category: 'restaurant',
        amountCents: 3000,
        shares: { ada: 1000, grace: 2000 },
      }),
    ]);
    await screen.findByTestId('statistics-centre-amount');

    await openMoreOptions();
    await fireEvent.press(screen.getByRole('button', { name: /Participants:/ }));
    expect(screen.getByRole('button', { name: 'Everybody' }).props.accessibilityState).toMatchObject(
      { selected: true },
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Only you' }));
    expect(
      screen.getByRole('checkbox', { name: 'Ada Lovelace' }).props.accessibilityState,
    ).toMatchObject({ checked: true });
    expect(
      screen.getByRole('checkbox', { name: 'Grace Hopper' }).props.accessibilityState,
    ).toMatchObject({ checked: false });

    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByTestId('statistics-centre-amount')).toHaveTextContent('10.00');
  });

  it('shows a selected category in the centre, and deselects on a second tap', async () => {
    await renderScreen([
      transaction({ category: 'groceries', amountCents: 3000 }),
      transaction({ category: 'travel', amountCents: 1000 }),
    ]);
    await screen.findByTestId('statistics-centre-amount');

    const row = screen.getByRole('button', { name: 'Travel, 10.00, 25%' });
    await fireEvent.press(row);

    expect(screen.getByTestId('statistics-centre-label')).toHaveTextContent(/Travel/);
    expect(screen.getByTestId('statistics-centre-amount')).toHaveTextContent('10.00');
    expect(screen.getByTestId('statistics-centre-percent')).toHaveTextContent('25%');

    await fireEvent.press(row);

    expect(screen.getByTestId('statistics-centre-label')).toHaveTextContent('Total spending');
    expect(screen.queryByTestId('statistics-centre-percent')).toBeNull();
  });

  it('drops the selection when the measure changes', async () => {
    await renderScreen([
      transaction({ category: 'groceries', amountCents: 3000 }),
      transaction({ kind: 'income', category: 'gifts', amountCents: 800 }),
    ]);
    await screen.findByTestId('statistics-centre-amount');

    await fireEvent.press(screen.getByRole('button', { name: 'Groceries, 30.00, 100%' }));
    expect(screen.getByTestId('statistics-centre-label')).toHaveTextContent(/Groceries/);

    await fireEvent.press(screen.getByRole('button', { name: 'Income' }));

    expect(screen.getByTestId('statistics-centre-label')).toHaveTextContent('Total income');
  });

  it('explains an empty group rather than drawing an empty ring', async () => {
    await renderScreen([]);

    expect(await screen.findByText(/Nothing spent yet/)).toBeTruthy();
    expect(screen.queryByTestId('donut-chart')).toBeNull();
  });

  it('says that no income was recorded, not that there is nothing at all', async () => {
    await renderScreen([transaction({ category: 'groceries', amountCents: 3000 })]);
    await screen.findByTestId('statistics-centre-amount');

    await fireEvent.press(screen.getByRole('button', { name: 'Income' }));

    expect(screen.getByText('Nothing recorded as income yet.')).toBeTruthy();
  });

  it('says nothing concerns the selected participant when their own share is nothing', async () => {
    await renderScreen([
      transaction({ category: 'gifts', amountCents: 2500, shares: { grace: 2500 } }),
    ]);
    await screen.findByTestId('statistics-centre-amount');

    await openMoreOptions();
    await fireEvent.press(screen.getByRole('button', { name: /Participants:/ }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Grace Hopper' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    expect(
      screen.getByText(/None of this group’s spending concerns the selected participants/),
    ).toBeTruthy();
  });

  it('offers a retry when the transactions could not be loaded', async () => {
    mockFetchTransactions.mockRejectedValue(new Error('offline'));
    await render(
      <StatisticsScreen groupId="group-1" subgroups={[]} members={members} viewerId={ada.id} />,
    );

    const retry = await screen.findByRole('button', { name: 'Try again' });
    mockFetchTransactions.mockResolvedValue({ transactions: [], excludedSubgroupCount: 0 });
    await fireEvent.press(retry);

    expect(await screen.findByText(/Nothing spent yet/)).toBeTruthy();
  });

  it('waits on the transactions rather than showing an empty chart', async () => {
    mockFetchTransactions.mockReturnValue(new Promise(() => undefined));
    await render(
      <StatisticsScreen groupId="group-1" subgroups={[]} members={members} viewerId={ada.id} />,
    );

    expect(screen.getByTestId('statistics-loading')).toBeTruthy();
    expect(screen.queryByText(/Nothing spent yet/)).toBeNull();
  });

  describe('sub-groups', () => {
    it('includes sub-groups by default and offers to exclude them', async () => {
      mockFetchTransactions.mockResolvedValue({
        transactions: [transaction({ category: 'groceries', amountCents: 3000 })],
        excludedSubgroupCount: 2,
      });

      await render(
        <StatisticsScreen
          groupId="group-1"
          subgroups={[subOne, subTwo]}
          members={members}
          viewerId={ada.id}
        />,
      );

      await screen.findByTestId('statistics-centre-amount');
      await openMoreOptions();
      expect(screen.getByRole('button', { name: 'Subgroups: All' })).toBeTruthy();
      expect(screen.getByText('2 sub-groups you’re not in aren’t included.')).toBeTruthy();
    });

    it('shows no toggle for a group with no sub-groups', async () => {
      await renderScreen([transaction({ category: 'groceries', amountCents: 3000 })]);
      await screen.findByTestId('statistics-centre-amount');
      await openMoreOptions();

      expect(screen.queryByRole('button', { name: /Subgroups:/ })).toBeNull();
    });

    it('excludes sub-groups when deselected, and clears any category selection', async () => {
      mockFetchTransactions.mockResolvedValue({
        transactions: [transaction({ category: 'groceries', amountCents: 3000 })],
        excludedSubgroupCount: 0,
      });

      await render(
        <StatisticsScreen
          groupId="group-1"
          subgroups={[subOne, subTwo]}
          members={members}
          viewerId={ada.id}
        />,
      );
      await screen.findByTestId('statistics-centre-amount');
      await fireEvent.press(screen.getByRole('button', { name: 'Groceries, 30.00, 100%' }));

      mockFetchTransactions.mockResolvedValue({
        transactions: [transaction({ category: 'travel', amountCents: 500 })],
        excludedSubgroupCount: 0,
      });
      await openMoreOptions();
      await fireEvent.press(screen.getByRole('button', { name: 'Subgroups: All' }));
      await fireEvent.press(screen.getByRole('button', { name: 'None' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

      expect(await screen.findByTestId('statistics-centre-amount')).toHaveTextContent('5.00');
      expect(screen.getByTestId('statistics-centre-label')).toHaveTextContent('Total spending');
      expect(screen.getByRole('button', { name: 'Subgroups: None' })).toBeTruthy();
    });

    it('narrows to a single named sub-group and its own nested branch', async () => {
      mockFetchTransactions.mockResolvedValue({
        transactions: [transaction({ category: 'groceries', amountCents: 3000 })],
        excludedSubgroupCount: 0,
      });

      await render(
        <StatisticsScreen
          groupId="group-1"
          subgroups={[subOne, subTwo]}
          members={members}
          viewerId={ada.id}
        />,
      );
      await screen.findByTestId('statistics-centre-amount');

      await openMoreOptions();
      await fireEvent.press(screen.getByRole('button', { name: 'Subgroups: All' }));
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Bastia weekend' }));

      expect(
        screen.getByRole('checkbox', { name: 'Ajaccio weekend' }).props.accessibilityState,
      ).toMatchObject({ checked: true });
      expect(
        screen.getByRole('checkbox', { name: 'Bastia weekend' }).props.accessibilityState,
      ).toMatchObject({ checked: false });

      await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

      expect(screen.getByRole('button', { name: 'Subgroups: Ajaccio weekend' })).toBeTruthy();
    });
  });

  describe('date range', () => {
    const originalOS = Platform.OS;

    beforeEach(() => {
      Platform.OS = 'ios';
    });

    afterEach(() => {
      Platform.OS = originalOS;
    });

    it('shows "Any" for both bounds by default', async () => {
      await renderScreen([transaction({ category: 'groceries', amountCents: 3000 })]);
      await screen.findByTestId('statistics-centre-amount');
      await openMoreOptions();

      expect(screen.getByRole('button', { name: 'From: Any' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'To: Any' })).toBeTruthy();
    });

    it('excludes transactions before the "from" date', async () => {
      await renderScreen([
        transaction({ category: 'groceries', amountCents: 1000, occurredOn: '2026-01-01' }),
        transaction({ category: 'travel', amountCents: 2000, occurredOn: '2027-06-01' }),
      ]);
      await screen.findByTestId('statistics-centre-amount');
      await openMoreOptions();

      await fireEvent.press(screen.getByRole('button', { name: 'From: Any' }));
      await fireEvent.press(screen.getByRole('button', { name: 'date-picker-mock' }));

      expect(await screen.findByTestId('statistics-centre-amount')).toHaveTextContent('20.00');
      expect(screen.getByRole('button', { name: 'Clear from' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'From: Any' })).toBeNull();
    });

    it('excludes transactions after the "to" date', async () => {
      await renderScreen([
        transaction({ category: 'groceries', amountCents: 1000, occurredOn: '2026-01-01' }),
        transaction({ category: 'travel', amountCents: 2000, occurredOn: '2027-06-01' }),
      ]);
      await screen.findByTestId('statistics-centre-amount');
      await openMoreOptions();

      await fireEvent.press(screen.getByRole('button', { name: 'To: Any' }));
      await fireEvent.press(screen.getByRole('button', { name: 'date-picker-mock' }));

      expect(await screen.findByTestId('statistics-centre-amount')).toHaveTextContent('10.00');
    });

    it('clearing a bound restores every transaction', async () => {
      await renderScreen([
        transaction({ category: 'groceries', amountCents: 1000, occurredOn: '2026-01-01' }),
        transaction({ category: 'travel', amountCents: 2000, occurredOn: '2027-06-01' }),
      ]);
      await screen.findByTestId('statistics-centre-amount');
      await openMoreOptions();

      await fireEvent.press(screen.getByRole('button', { name: 'From: Any' }));
      await fireEvent.press(screen.getByRole('button', { name: 'date-picker-mock' }));
      expect(await screen.findByTestId('statistics-centre-amount')).toHaveTextContent('20.00');

      await fireEvent.press(screen.getByRole('button', { name: 'Clear from' }));

      expect(await screen.findByTestId('statistics-centre-amount')).toHaveTextContent('30.00');
      expect(screen.getByRole('button', { name: 'From: Any' })).toBeTruthy();
    });

    it('explains a date range with nothing in it, rather than drawing an empty ring', async () => {
      await renderScreen([
        transaction({ category: 'groceries', amountCents: 1000, occurredOn: '2026-01-01' }),
      ]);
      await screen.findByTestId('statistics-centre-amount');
      await openMoreOptions();

      await fireEvent.press(screen.getByRole('button', { name: 'From: Any' }));
      await fireEvent.press(screen.getByRole('button', { name: 'date-picker-mock' }));

      expect(
        await screen.findByText('Nothing spent in the selected date range.'),
      ).toBeTruthy();
    });
  });

  describe('more options', () => {
    it('starts collapsed, with the type switch always visible', async () => {
      await renderScreen([transaction({ category: 'groceries', amountCents: 3000 })]);
      await screen.findByTestId('statistics-centre-amount');

      expect(screen.getByRole('button', { name: 'Spending' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Income' })).toBeTruthy();
      expect(
        screen.getByRole('button', { name: 'More options' }).props.accessibilityState,
      ).toMatchObject({ expanded: false });
    });

    it('reveals the fields on tap, and marks itself expanded', async () => {
      await renderScreen([transaction({ category: 'groceries', amountCents: 3000 })]);
      await screen.findByTestId('statistics-centre-amount');

      await openMoreOptions();

      expect(screen.getByRole('button', { name: /Participants:/ })).toBeTruthy();
      expect(
        screen.getByRole('button', { name: 'More options' }).props.accessibilityState,
      ).toMatchObject({ expanded: true });
    });
  });
});
