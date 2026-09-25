import type { Balance } from '@splitcount/shared';
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { UseBalancesResult } from '@/features/transactions/use-balances';

import { ReimbursementsScreen } from './reimbursements-screen';

const ada = { id: 'ada', name: 'Ada Lovelace', picture: null };
const grace = { id: 'grace', name: 'Grace Hopper', picture: null };
const alan = { id: 'alan', name: 'Alan Turing', picture: null };
const members = [
  { ...ada, role: 'owner' as const },
  { ...grace, role: 'member' as const },
  { ...alan, role: 'member' as const },
];

const balances = (entries: Record<string, number>): Balance[] =>
  Object.entries(entries).map(([userId, amountCents]) => ({ userId, amountCents }));

/** Ada owes Alan 10.00, Grace came out even — the netted-chain case. */
const chain = balances({ alan: 1000, grace: 0, ada: -1000 });

function result(overrides: Partial<UseBalancesResult> = {}): UseBalancesResult {
  return { status: 'ready', balances: chain, refresh: jest.fn(), ...overrides };
}

async function renderScreen(
  overrides: Partial<Parameters<typeof ReimbursementsScreen>[0]> = {},
) {
  return render(
    <ReimbursementsScreen
      balances={result()}
      members={members}
      viewerId={ada.id}
      readOnly={false}
      onRecord={jest.fn()}
      {...overrides}
    />,
  );
}

describe('ReimbursementsScreen', () => {
  it('nets a chain of debts into one payment, worded for the viewer', async () => {
    await renderScreen();

    // Grace is at zero overall, so she is not asked to pay or be paid.
    expect(screen.getByRole('button', { name: 'You pay Alan Turing 10.00' })).toBeTruthy();
    expect(screen.getByText('One payment clears everything.')).toBeTruthy();
    expect(screen.queryByLabelText(/Grace Hopper pays/)).toBeNull();
  });

  it('words a payment between two other people by name', async () => {
    await renderScreen({ viewerId: grace.id });

    expect(
      screen.getByRole('button', { name: 'Ada Lovelace pays Alan Turing 10.00' }),
    ).toBeTruthy();
  });

  it('puts the viewer’s own payments first', async () => {
    await renderScreen({
      balances: result({ balances: balances({ alan: 6000, ada: -1000, grace: -5000 }) }),
    });

    const labels = screen
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel)
      .filter(
        (label: unknown): label is string =>
          typeof label === 'string' && label.includes('pay'),
      );
    expect(labels).toEqual(['You pay Alan Turing 10.00', 'Grace Hopper pays Alan Turing 50.00']);
  });

  it('records a suggested payment when it is tapped', async () => {
    const onRecord = jest.fn();
    await renderScreen({ onRecord });

    await fireEvent.press(screen.getByRole('button', { name: 'You pay Alan Turing 10.00' }));

    expect(onRecord).toHaveBeenCalledWith({ from: ada, to: alan, amountCents: 1000 });
  });

  it('explains, rather than silently ignoring, a payment it cannot record', async () => {
    const onRecord = jest.fn();
    await renderScreen({ readOnly: true, onRecord });

    await fireEvent.press(screen.getByRole('button', { name: 'You pay Alan Turing 10.00' }));

    expect(onRecord).not.toHaveBeenCalled();
    expect(screen.getByText('Reopen the group to record it.')).toBeTruthy();
  });

  it('names a departed party as the balance list does, and refuses to record them', async () => {
    await renderScreen({ members: [members[0]!, members[1]!] });

    expect(
      screen.getByText('Former member has left this group, so this can’t be recorded here.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'You pay Former member 10.00' }).props
        .accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it('reads as settled when nobody owes anybody', async () => {
    await renderScreen({
      balances: result({ balances: balances({ ada: 0, grace: 0, alan: 0 }) }),
    });

    expect(screen.getByText('You’re all settled up')).toBeTruthy();
    expect(screen.queryByText('Suggested reimbursements')).toBeNull();
  });

  it('shows where everyone stands, the viewer as “You”', async () => {
    await renderScreen();

    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('−10.00')).toBeTruthy();
    expect(screen.getByText('+10.00')).toBeTruthy();
    expect(screen.getByText('settled up')).toBeTruthy();
  });

  it('covers this group only, with no sub-group scope to choose', async () => {
    await renderScreen();

    expect(screen.queryByRole('button', { name: 'Include sub-groups' })).toBeNull();
  });

  it('waits on the balances it derives from rather than guessing', async () => {
    await renderScreen({ balances: result({ status: 'loading', balances: [] }) });

    expect(screen.getByTestId('reimbursements-loading')).toBeTruthy();
    expect(screen.queryByText('You’re all settled up')).toBeNull();
  });

  it('offers a retry on failure, and never reads as settled', async () => {
    const refresh = jest.fn();
    await renderScreen({ balances: result({ status: 'error', balances: [], refresh }) });

    expect(
      screen.getByText(
        'We couldn’t work out who owes what. Check your connection and try again.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('You’re all settled up')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(refresh).toHaveBeenCalled();
  });
});
