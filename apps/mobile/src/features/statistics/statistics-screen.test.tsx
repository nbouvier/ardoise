import type {
  Transaction,
  TransactionCategory,
  TransactionKind,
  TransactionsListResponse,
} from '@splitcount/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { StatisticsScreen } from './statistics-screen';

const ada = { id: 'ada', name: 'Ada Lovelace', picture: null };
const grace = { id: 'grace', name: 'Grace Hopper', picture: null };
const members = [
  { ...ada, role: 'member' as const },
  { ...grace, role: 'member' as const },
];

let sequence = 0;

function transaction({
  kind = 'expense' as TransactionKind,
  category = 'other' as TransactionCategory,
  amountCents,
  shares,
}: {
  kind?: TransactionKind;
  category?: TransactionCategory;
  amountCents: number;
  shares?: { ada?: number; grace?: number };
}): Transaction {
  sequence += 1;
  const split = shares ?? { ada: amountCents };

  return {
    id: `tx-${sequence}`,
    groupId: 'group',
    kind,
    title: 'Something',
    amountCents,
    occurredOn: '2026-01-01',
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

async function renderScreen(
  transactions: Transaction[],
  overrides: Partial<Parameters<typeof StatisticsScreen>[0]> = {},
) {
  mockFetchTransactions.mockResolvedValue({ transactions, excludedSubgroupCount: 0 });
  return render(
    <StatisticsScreen
      groupId="group-1"
      hasSubgroups={false}
      members={members}
      viewerId={ada.id}
      onClose={jest.fn()}
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

    await fireEvent.press(screen.getByRole('button', { name: 'Grace Hopper' }));

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

    await fireEvent.press(screen.getByRole('button', { name: 'Grace Hopper' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Grace Hopper' }));

    expect(screen.getByTestId('statistics-centre-amount')).toHaveTextContent('30.00');
  });

  it('explains that no participant is selected rather than drawing an empty ring', async () => {
    await renderScreen([transaction({ category: 'groceries', amountCents: 3000 })]);
    await screen.findByTestId('statistics-centre-amount');

    await fireEvent.press(screen.getByRole('button', { name: 'You' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Grace Hopper' }));

    expect(screen.getByText(/Select at least one participant/)).toBeTruthy();
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

    await fireEvent.press(screen.getByRole('button', { name: 'Grace Hopper' }));

    expect(
      screen.getByText(/None of this group’s spending concerns the selected participants/),
    ).toBeTruthy();
  });

  it('offers a retry when the transactions could not be loaded', async () => {
    mockFetchTransactions.mockRejectedValue(new Error('offline'));
    await render(
      <StatisticsScreen
        groupId="group-1"
        hasSubgroups={false}
        members={members}
        viewerId={ada.id}
        onClose={jest.fn()}
      />,
    );

    const retry = await screen.findByRole('button', { name: 'Try again' });
    mockFetchTransactions.mockResolvedValue({ transactions: [], excludedSubgroupCount: 0 });
    await fireEvent.press(retry);

    expect(await screen.findByText(/Nothing spent yet/)).toBeTruthy();
  });

  it('waits on the transactions rather than showing an empty chart', async () => {
    mockFetchTransactions.mockReturnValue(new Promise(() => undefined));
    await render(
      <StatisticsScreen
        groupId="group-1"
        hasSubgroups={false}
        members={members}
        viewerId={ada.id}
        onClose={jest.fn()}
      />,
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
          hasSubgroups
          members={members}
          viewerId={ada.id}
          onClose={jest.fn()}
        />,
      );

      await screen.findByTestId('statistics-centre-amount');
      expect(
        screen.getByRole('button', { name: 'Include sub-groups' }).props.accessibilityState
          .selected,
      ).toBe(true);
      expect(screen.getByText('2 sub-groups you’re not in aren’t included.')).toBeTruthy();
    });

    it('shows no toggle for a group with no sub-groups', async () => {
      await renderScreen([transaction({ category: 'groceries', amountCents: 3000 })]);
      await screen.findByTestId('statistics-centre-amount');

      expect(screen.queryByRole('button', { name: 'Include sub-groups' })).toBeNull();
    });

    it('excludes sub-groups when toggled off, and clears any selection', async () => {
      mockFetchTransactions.mockResolvedValue({
        transactions: [transaction({ category: 'groceries', amountCents: 3000 })],
        excludedSubgroupCount: 0,
      });

      await render(
        <StatisticsScreen
          groupId="group-1"
          hasSubgroups
          members={members}
          viewerId={ada.id}
          onClose={jest.fn()}
        />,
      );
      await screen.findByTestId('statistics-centre-amount');
      await fireEvent.press(screen.getByRole('button', { name: 'Groceries, 30.00, 100%' }));

      mockFetchTransactions.mockResolvedValue({
        transactions: [transaction({ category: 'travel', amountCents: 500 })],
        excludedSubgroupCount: 0,
      });
      await fireEvent.press(screen.getByRole('button', { name: 'Include sub-groups' }));

      expect(await screen.findByTestId('statistics-centre-amount')).toHaveTextContent('5.00');
      expect(screen.getByTestId('statistics-centre-label')).toHaveTextContent('Total spending');
    });
  });
});
