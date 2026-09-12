import type { Transaction, TransactionCategory, TransactionKind } from '@splitcount/shared';
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { StatisticsScreen } from './statistics-screen';

const ada = { id: 'ada', name: 'Ada Lovelace', picture: null };
const grace = { id: 'grace', name: 'Grace Hopper', picture: null };

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

function renderScreen(
  transactions: Transaction[],
  overrides: Partial<Parameters<typeof StatisticsScreen>[0]> = {},
) {
  return render(
    <StatisticsScreen
      transactions={transactions}
      status="ready"
      onRetry={jest.fn()}
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

    expect(screen.getByTestId('statistics-centre-label')).toHaveTextContent('Total spending');
    expect(screen.getByTestId('statistics-centre-amount')).toHaveTextContent('40.00');
    expect(screen.getByRole('button', { name: 'Groceries, 30.00, 75%' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Travel, 10.00, 25%' })).toBeTruthy();
  });

  it('draws one arc per category', async () => {
    await renderScreen([
      transaction({ category: 'groceries', amountCents: 3000 }),
      transaction({ category: 'travel', amountCents: 1000 }),
    ]);

    expect(screen.getByTestId('donut-slice-groceries')).toBeTruthy();
    expect(screen.getByTestId('donut-slice-travel')).toBeTruthy();
    expect(screen.queryByTestId('donut-slice-housing')).toBeNull();
  });

  it('leaves transfers out of the total', async () => {
    await renderScreen([
      transaction({ category: 'groceries', amountCents: 3000 }),
      transaction({ kind: 'transfer', category: 'groceries', amountCents: 5000 }),
    ]);

    expect(screen.getByTestId('statistics-centre-amount')).toHaveTextContent('30.00');
  });

  it('switches to the group’s income', async () => {
    await renderScreen([
      transaction({ category: 'groceries', amountCents: 3000 }),
      transaction({ kind: 'income', category: 'gifts', amountCents: 800 }),
    ]);

    await fireEvent.press(screen.getByRole('button', { name: 'Income' }));

    expect(screen.getByTestId('statistics-centre-label')).toHaveTextContent('Total income');
    expect(screen.getByTestId('statistics-centre-amount')).toHaveTextContent('8.00');
    expect(screen.queryByTestId('donut-slice-groceries')).toBeNull();
  });

  it('switches to the viewer’s own share', async () => {
    await renderScreen([
      transaction({
        category: 'restaurant',
        amountCents: 3000,
        shares: { ada: 1000, grace: 2000 },
      }),
    ]);

    expect(screen.getByTestId('statistics-centre-amount')).toHaveTextContent('30.00');

    await fireEvent.press(screen.getByRole('button', { name: 'Me' }));

    expect(screen.getByTestId('statistics-centre-amount')).toHaveTextContent('10.00');
  });

  it('shows a selected category in the centre, and deselects on a second tap', async () => {
    await renderScreen([
      transaction({ category: 'groceries', amountCents: 3000 }),
      transaction({ category: 'travel', amountCents: 1000 }),
    ]);

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

    await fireEvent.press(screen.getByRole('button', { name: 'Groceries, 30.00, 100%' }));
    expect(screen.getByTestId('statistics-centre-label')).toHaveTextContent(/Groceries/);

    await fireEvent.press(screen.getByRole('button', { name: 'Income' }));

    expect(screen.getByTestId('statistics-centre-label')).toHaveTextContent('Total income');
  });

  it('explains an empty group rather than drawing an empty ring', async () => {
    await renderScreen([]);

    expect(screen.getByText(/Nothing spent yet/)).toBeTruthy();
    expect(screen.queryByTestId('donut-chart')).toBeNull();
  });

  it('says that no income was recorded, not that there is nothing at all', async () => {
    await renderScreen([transaction({ category: 'groceries', amountCents: 3000 })]);

    await fireEvent.press(screen.getByRole('button', { name: 'Income' }));

    expect(screen.getByText('Nothing recorded as income yet.')).toBeTruthy();
  });

  it('says nothing concerns the viewer when their own share is nothing', async () => {
    await renderScreen([
      transaction({ category: 'gifts', amountCents: 2500, shares: { grace: 2500 } }),
    ]);

    await fireEvent.press(screen.getByRole('button', { name: 'Me' }));

    expect(screen.getByText(/None of this group’s spending concerns you/)).toBeTruthy();
  });

  it('offers a retry when the transactions could not be loaded', async () => {
    const onRetry = jest.fn();
    await renderScreen([], { status: 'error', onRetry });

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalled();
  });

  it('waits on the transactions rather than showing an empty chart', async () => {
    await renderScreen([], { status: 'loading' });

    expect(screen.getByTestId('statistics-loading')).toBeTruthy();
    expect(screen.queryByText(/Nothing spent yet/)).toBeNull();
  });
});
