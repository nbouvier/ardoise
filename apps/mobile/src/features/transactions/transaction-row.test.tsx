import type { Transaction } from '@ardoise/shared';
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

  describe('Others', () => {
    const me = ada;
    const member1 = grace;
    const member2 = { id: 'alan', name: 'Alan Turing', picture: null };

    // The spec's example: 60 € paid by me, 10 € each for me and two members,
    // 30 € for Others.
    const withOthers: Transaction = {
      ...expense,
      amountCents: 6000,
      payer: me,
      splitMode: 'amount',
      participants: [
        { user: me, shareCents: 1000, weight: null },
        { user: member1, shareCents: 1000, weight: null },
        { user: member2, shareCents: 1000, weight: null },
        { user: null, shareCents: 3000, weight: null },
      ],
    };

    it('credits the payer the members’ shares only, never Others’', async () => {
      await render(<TransactionRow transaction={withOthers} viewerId={me.id} />);

      expect(screen.getByText('+20.00')).toBeTruthy();
    });

    it('debits a member their own share', async () => {
      await render(<TransactionRow transaction={withOthers} viewerId={member1.id} />);

      expect(screen.getByText('−10.00')).toBeTruthy();
    });

    it('names Others as the payer and moves nothing for anyone', async () => {
      const paidByOthers: Transaction = { ...withOthers, payer: null };
      await render(<TransactionRow transaction={paidByOthers} viewerId={me.id} />);

      expect(screen.getByText(/Others$/)).toBeTruthy();
      expect(screen.getByText('—')).toBeTruthy();
    });

    it('shows a dash when Others is the only participant', async () => {
      const onlyOthers: Transaction = {
        ...withOthers,
        participants: [{ user: null, shareCents: 6000, weight: null }],
      };
      await render(<TransactionRow transaction={onlyOthers} viewerId={me.id} />);

      expect(screen.getByText('—')).toBeTruthy();
    });
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
