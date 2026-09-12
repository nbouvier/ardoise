import type { Transaction } from '@splitcount/shared';
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { TransactionRow } from './transaction-row';

const ada = { id: 'ada', name: 'Ada Lovelace', picture: null };
const grace = { id: 'grace', name: 'Grace Hopper', picture: null };

const expense: Transaction = {
  id: 'tx-1',
  groupId: 'group-1',
  kind: 'expense',
  title: 'Groceries',
  amountCents: 1000,
  occurredOn: '2026-09-11',
  comment: null,
  category: 'other',
  payer: ada,
  splitMode: 'shares',
  participants: [
    { user: ada, shareCents: 500, weight: 1 },
    { user: grace, shareCents: 500, weight: 1 },
  ],
  createdBy: ada.id,
  createdAt: '2026-09-11T12:00:00.000Z',
  updatedAt: '2026-09-11T12:00:00.000Z',
};

describe('TransactionRow', () => {
  it('shows a positive share for the payer', async () => {
    await render(<TransactionRow transaction={expense} viewerId={ada.id} onPress={jest.fn()} />);

    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('+5.00')).toBeTruthy();
  });

  it('shows a negative share for a plain participant', async () => {
    await render(<TransactionRow transaction={expense} viewerId={grace.id} onPress={jest.fn()} />);

    expect(screen.getByText('−5.00')).toBeTruthy();
  });

  it('shows a dash for someone the transaction does not involve', async () => {
    await render(<TransactionRow transaction={expense} viewerId="someone-else" onPress={jest.fn()} />);

    expect(screen.getByText('—')).toBeTruthy();
  });

  it('calls onPress with the transaction', async () => {
    const onPress = jest.fn();
    await render(<TransactionRow transaction={expense} viewerId={ada.id} onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Groceries' }));

    expect(onPress).toHaveBeenCalledWith(expense);
  });

  it('renders as non-interactive when no onPress is given', async () => {
    await render(<TransactionRow transaction={expense} viewerId={ada.id} />);

    expect(screen.queryByRole('button', { name: 'Groceries' })).toBeNull();
    expect(screen.getByText('Groceries')).toBeTruthy();
  });

  // The emoji is the row's category badge, beside the title rather than inside
  // it — see "Transaction row" in docs/DESIGN.md.
  it('shows the category emoji on its badge', async () => {
    await render(
      <TransactionRow
        transaction={{ ...expense, category: 'groceries' }}
        viewerId={ada.id}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText('🛒')).toBeTruthy();
    expect(screen.getByText('Groceries')).toBeTruthy();
  });

  it('defaults to the Other emoji', async () => {
    await render(<TransactionRow transaction={expense} viewerId={ada.id} onPress={jest.fn()} />);

    expect(screen.getByText('🧾')).toBeTruthy();
  });
});
