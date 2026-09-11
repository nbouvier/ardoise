import type { GroupDetail, Transaction } from '@splitcount/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { TransactionFormScreen } from './transaction-form-screen';

const ada = { id: 'ada', name: 'Ada Lovelace', picture: null };
const grace = { id: 'grace', name: 'Grace Hopper', picture: null };

const group: GroupDetail = {
  id: 'group-1',
  kind: 'standard',
  name: 'Trip',
  memberCount: 2,
  archivedAt: null,
  createdAt: '2026-09-11T12:00:00.000Z',
  members: [
    { ...ada, role: 'owner' },
    { ...grace, role: 'member' },
  ],
  viewerRole: 'owner',
};

const existing: Transaction = {
  id: 'tx-1',
  groupId: group.id,
  kind: 'expense',
  title: 'Groceries',
  amountCents: 1000,
  occurredOn: '2026-09-10',
  comment: 'Weekly run',
  payer: ada,
  splitMode: 'shares',
  participants: [
    { user: ada, shareCents: 500, weight: 1 },
    { user: grace, shareCents: 500, weight: 1 },
  ],
  createdBy: ada.id,
  createdAt: '2026-09-10T12:00:00.000Z',
  updatedAt: '2026-09-10T12:00:00.000Z',
};

const mockCreateTransaction = jest.fn<() => Promise<Transaction>>();
const mockUpdateTransaction = jest.fn<() => Promise<Transaction>>();
const mockDeleteTransaction = jest.fn<() => Promise<void>>();

jest.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({ authorizedFetch: jest.fn() }),
}));

jest.mock('@/lib/api/transactions', () => ({
  createTransaction: (...args: unknown[]) => mockCreateTransaction(...(args as [])),
  updateTransaction: (...args: unknown[]) => mockUpdateTransaction(...(args as [])),
  deleteTransaction: (...args: unknown[]) => mockDeleteTransaction(...(args as [])),
}));

beforeEach(() => {
  mockCreateTransaction.mockReset().mockResolvedValue(existing);
  mockUpdateTransaction.mockReset().mockResolvedValue(existing);
  mockDeleteTransaction.mockReset().mockResolvedValue(undefined);
});

describe('TransactionFormScreen — recording', () => {
  it('defaults to an equal shares split of every member, payer is the viewer, Save disabled until valid', async () => {
    await render(
      <TransactionFormScreen
        group={group}
        viewerId={ada.id}
        onSaved={jest.fn()}
        onDeleted={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByRole('checkbox', { name: 'Ada Lovelace' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: true }),
    );
    expect(screen.getByRole('checkbox', { name: 'Grace Hopper' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: true }),
    );
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ disabled: true }),
    );
  });

  it('submits an expense with the entered title, amount and the default split', async () => {
    const onSaved = jest.fn();
    await render(
      <TransactionFormScreen
        group={group}
        viewerId={ada.id}
        onSaved={onSaved}
        onDeleted={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Groceries');
    await fireEvent.changeText(screen.getByLabelText('Amount'), '10');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.anything(),
      group.id,
      expect.objectContaining({
        kind: 'expense',
        title: 'Groceries',
        amount: 1000,
        payerId: ada.id,
        split: {
          mode: 'shares',
          participants: [
            { userId: ada.id, weight: 1 },
            { userId: grace.id, weight: 1 },
          ],
        },
      }),
    );
    expect(onSaved).toHaveBeenCalledWith(existing);
  });

  it('switches to a transfer, requiring a recipient other than the payer', async () => {
    await render(
      <TransactionFormScreen
        group={group}
        viewerId={ada.id}
        onSaved={jest.fn()}
        onDeleted={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Transfer' }));
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Reimbursement');
    await fireEvent.changeText(screen.getByLabelText('Amount'), '20');

    // No recipient chosen yet.
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ disabled: true }),
    );

    // Index 0 is the "Who paid" picker's Grace option; index 1 is "To"'s.
    await fireEvent.press(screen.getAllByRole('radio', { name: 'Grace Hopper' })[1]!);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.anything(),
      group.id,
      expect.objectContaining({ kind: 'transfer', toUserId: grace.id, payerId: ada.id }),
    );
  });
});

describe('TransactionFormScreen — editing', () => {
  it('pre-fills every field from the existing transaction', async () => {
    await render(
      <TransactionFormScreen
        group={group}
        viewerId={ada.id}
        initial={existing}
        onSaved={jest.fn()}
        onDeleted={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Title').props.value).toBe('Groceries');
    expect(screen.getByLabelText('Amount').props.value).toBe('10.00');
    expect(screen.getByLabelText('Comment').props.value).toBe('Weekly run');
    expect(screen.getByRole('button', { name: 'Delete this transaction' })).toBeTruthy();
  });

  it('sends a full replace on save, not a partial update', async () => {
    const onSaved = jest.fn();
    await render(
      <TransactionFormScreen
        group={group}
        viewerId={ada.id}
        initial={existing}
        onSaved={onSaved}
        onDeleted={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Groceries (corrected)');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(mockUpdateTransaction).toHaveBeenCalledWith(
      expect.anything(),
      group.id,
      existing.id,
      expect.objectContaining({
        kind: 'expense',
        title: 'Groceries (corrected)',
        amount: 1000,
        occurredOn: '2026-09-10',
        payerId: ada.id,
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });
});
