import type { GroupDetail, Transaction } from '@ardoise/shared';
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

const existing: Transaction = {
  id: 'tx-1',
  groupId: group.id,
  kind: 'expense',
  title: 'Groceries',
  amountCents: 1000,
  occurredOn: '2026-09-10',
  comment: 'Weekly run',
  category: 'groceries',
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

    // Both members start concerned, each with their own (zero, until an
    // amount is entered) live preview — neither row is missing. Others has a
    // row too, but is not concerned by default.
    expect(screen.getAllByText('= 0.00')).toHaveLength(3);
    expect(screen.getByText('Others')).toBeTruthy();
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
        category: 'other',
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

  it('sends Others as userId null once it is given a weight', async () => {
    await render(
      <TransactionFormScreen
        group={group}
        viewerId={ada.id}
        onSaved={jest.fn()}
        onDeleted={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Dinner');
    await fireEvent.changeText(screen.getByLabelText('Amount'), '60');
    // Ada, Grace, then Others — the last stepper.
    await fireEvent.press(screen.getAllByRole('button', { name: 'Increase weight' })[2]!);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Increase weight' })[2]!);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.anything(),
      group.id,
      expect.objectContaining({
        payerId: ada.id,
        split: {
          mode: 'shares',
          participants: [
            { userId: ada.id, weight: 1 },
            { userId: grace.id, weight: 1 },
            { userId: null, weight: 2 },
          ],
        },
      }),
    );
  });

  it('sends Others’ fixed amount as userId null', async () => {
    await render(
      <TransactionFormScreen
        group={group}
        viewerId={ada.id}
        onSaved={jest.fn()}
        onDeleted={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Dinner');
    await fireEvent.changeText(screen.getByLabelText('Amount'), '60');
    await fireEvent.press(screen.getByRole('button', { name: 'Fixed' }));
    await fireEvent.changeText(screen.getByLabelText('Ada Lovelace’s amount'), '10');
    await fireEvent.changeText(screen.getByLabelText('Grace Hopper’s amount'), '20');
    // The remaining 30 € is Others'.
    expect(screen.getByText('30.00 left to allocate')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Others’ amount'), '30');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.anything(),
      group.id,
      expect.objectContaining({
        split: {
          mode: 'amount',
          participants: [
            { userId: ada.id, amount: 1000 },
            { userId: grace.id, amount: 2000 },
            { userId: null, amount: 3000 },
          ],
        },
      }),
    );
  });

  it('can be saved with Others as the only participant', async () => {
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

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Advance to the neighbour');
    await fireEvent.changeText(screen.getByLabelText('Amount'), '40');
    // Drop both members (weight 1 → 0), then give Others a weight.
    await fireEvent.press(screen.getAllByRole('button', { name: 'Decrease weight' })[0]!);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Decrease weight' })[1]!);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ disabled: true }),
    );
    await fireEvent.press(screen.getAllByRole('button', { name: 'Increase weight' })[2]!);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.anything(),
      group.id,
      expect.objectContaining({
        split: { mode: 'shares', participants: [{ userId: null, weight: 1 }] },
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it('defaults to Other and can be switched to another preset', async () => {
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

    expect(screen.getByRole('button', { name: 'Category: Other' })).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Groceries');
    await fireEvent.changeText(screen.getByLabelText('Amount'), '10');
    await fireEvent.press(screen.getByRole('button', { name: 'Category: Other' }));
    expect(screen.getByRole('button', { name: 'Other' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Groceries' }));
    // Picking a category closes the sheet immediately, no separate save step.
    expect(screen.queryByRole('button', { name: 'Other' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Category: Groceries' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.anything(),
      group.id,
      expect.objectContaining({ category: 'groceries' }),
    );
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

    // "To" is a dropdown field: open it, then pick Grace from the list it pops up.
    await fireEvent.press(screen.getByRole('button', { name: 'To' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Grace Hopper' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.anything(),
      group.id,
      expect.objectContaining({ kind: 'transfer', toUserId: grace.id, payerId: ada.id }),
    );
  });
});

describe('TransactionFormScreen — Others as payer or recipient', () => {
  const renderForm = (initial?: Transaction) =>
    render(
      <TransactionFormScreen
        group={group}
        viewerId={ada.id}
        initial={initial}
        onSaved={jest.fn()}
        onDeleted={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

  const paidByOthers: Transaction = {
    ...existing,
    payer: null,
    participants: [
      { user: ada, shareCents: 500, weight: 1 },
      { user: null, shareCents: 500, weight: 1 },
    ],
  };

  const transferToOthers: Transaction = {
    ...existing,
    kind: 'transfer',
    title: 'Advance',
    splitMode: 'amount',
    participants: [{ user: null, shareCents: 1000, weight: null }],
  };

  it('never offers Others in “Who paid”, for a new transaction', async () => {
    await renderForm();

    await fireEvent.press(screen.getByRole('button', { name: 'Who paid' }));

    expect(screen.getByRole('radio', { name: 'Ada Lovelace' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Grace Hopper' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Others' })).toBeNull();
  });

  it('never offers Others in “To”, for a new transfer', async () => {
    await renderForm();

    await fireEvent.press(screen.getByRole('button', { name: 'Transfer' }));
    await fireEvent.press(screen.getByRole('button', { name: 'To' }));

    expect(screen.getByRole('radio', { name: 'Grace Hopper' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Others' })).toBeNull();
  });

  it('shows Others as the payer of a stored transaction, not the viewer', async () => {
    await renderForm(paidByOthers);

    expect(screen.getByRole('button', { name: 'Who paid' })).toHaveTextContent(/Others/);
    expect(screen.getByRole('button', { name: 'Who paid' })).not.toHaveTextContent(/Me/);
  });

  it('keeps Others as the payer on save', async () => {
    await renderForm(paidByOthers);

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Groceries (corrected)');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(mockUpdateTransaction).toHaveBeenCalledWith(
      expect.anything(),
      group.id,
      existing.id,
      expect.objectContaining({
        payerId: null,
        split: {
          mode: 'shares',
          participants: [
            { userId: ada.id, weight: 1 },
            { userId: null, weight: 1 },
          ],
        },
      }),
    );
  });

  it('replaces Others as the payer when a member is picked', async () => {
    await renderForm(paidByOthers);

    await fireEvent.press(screen.getByRole('button', { name: 'Who paid' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Grace Hopper' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(mockUpdateTransaction).toHaveBeenCalledWith(
      expect.anything(),
      group.id,
      existing.id,
      expect.objectContaining({ payerId: grace.id }),
    );
  });

  it('keeps Others as the recipient of a stored transfer on save', async () => {
    await renderForm(transferToOthers);

    expect(screen.getByRole('button', { name: 'To' })).toHaveTextContent(/Others/);

    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(mockUpdateTransaction).toHaveBeenCalledWith(
      expect.anything(),
      group.id,
      existing.id,
      expect.objectContaining({ kind: 'transfer', payerId: ada.id, toUserId: null }),
    );
  });

  it('replaces Others as the recipient when a member is picked', async () => {
    await renderForm(transferToOthers);

    await fireEvent.press(screen.getByRole('button', { name: 'To' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Grace Hopper' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(mockUpdateTransaction).toHaveBeenCalledWith(
      expect.anything(),
      group.id,
      existing.id,
      expect.objectContaining({ kind: 'transfer', toUserId: grace.id }),
    );
  });

  it('refuses a transfer between Others and Others', async () => {
    await renderForm({ ...transferToOthers, payer: null });

    expect(screen.getByRole('button', { name: 'Save' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ disabled: true }),
    );
  });

  it('does not take “nothing picked yet” for Others on a new transfer', async () => {
    await renderForm();

    await fireEvent.press(screen.getByRole('button', { name: 'Transfer' }));

    expect(screen.getByRole('button', { name: 'To' })).not.toHaveTextContent(/Others/);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ disabled: true }),
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
    expect(screen.getByRole('button', { name: 'Category: Groceries' })).toBeTruthy();
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
        category: 'groceries',
        payerId: ada.id,
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });
});
