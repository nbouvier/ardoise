import type { FriendSummary, SplitInput } from '@splitcount/shared';
import { describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { SplitEditor } from './split-editor';

const ada: FriendSummary = { id: 'ada', name: 'Ada Lovelace', picture: null };
const grace: FriendSummary = { id: 'grace', name: 'Grace Hopper', picture: null };
const alan: FriendSummary = { id: 'alan', name: 'Alan Turing', picture: null };
const members = [ada, grace, alan];

function Harness({
  initial,
  amountCents = 1000,
}: {
  initial: SplitInput;
  amountCents?: number;
}) {
  const [value, setValue] = useState<SplitInput>(initial);
  return <SplitEditor members={members} amountCents={amountCents} value={value} onChange={setValue} />;
}

const equalShares: SplitInput = {
  mode: 'shares',
  participants: [
    { userId: ada.id, weight: 1 },
    { userId: grace.id, weight: 1 },
  ],
};

describe('SplitEditor', () => {
  it('checks exactly the currently selected participants', async () => {
    await render(<Harness initial={equalShares} />);

    expect(screen.getByRole('checkbox', { name: 'Ada Lovelace' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: true }),
    );
    expect(screen.getByRole('checkbox', { name: 'Alan Turing' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: false }),
    );
  });

  it('adds a member at weight 1 when checked', async () => {
    await render(<Harness initial={equalShares} />);

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Alan Turing' }));

    expect(screen.getByRole('checkbox', { name: 'Alan Turing' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: true }),
    );
  });

  it('removes a member when unchecked', async () => {
    await render(<Harness initial={equalShares} />);

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Ada Lovelace' }));

    expect(screen.getByRole('checkbox', { name: 'Ada Lovelace' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: false }),
    );
  });

  it('recomputes the live preview when a weight changes', async () => {
    await render(<Harness initial={equalShares} amountCents={1000} />);

    // Equal weights: 5.00 each.
    expect(screen.getAllByText('= 5.00')).toHaveLength(2);

    // Ada's row is first, in member order.
    await fireEvent.press(screen.getAllByRole('button', { name: 'Increase weight' })[0]!);

    // Ada now weighs twice Grace: 6.67 / 3.33.
    expect(screen.getByText('= 6.67')).toBeTruthy();
    expect(screen.getByText('= 3.33')).toBeTruthy();
  });

  it('does not let a weight drop below 1', async () => {
    await render(<Harness initial={equalShares} />);

    const decreaseButtons = screen.getAllByRole('button', { name: 'Decrease weight' });
    expect(decreaseButtons[0]).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
  });

  it('seeds fixed amounts from the shares preview when switching modes', async () => {
    await render(<Harness initial={equalShares} amountCents={1000} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Fixed amounts' }));

    expect(screen.getAllByDisplayValue('5.00')).toHaveLength(2);
    expect(screen.getByText('Fully allocated')).toBeTruthy();
  });

  it('shows how much is left to allocate in fixed-amount mode', async () => {
    const partialAmounts: SplitInput = {
      mode: 'amount',
      participants: [
        { userId: ada.id, amount: 400 },
        { userId: grace.id, amount: 200 },
      ],
    };
    await render(<Harness initial={partialAmounts} amountCents={1000} />);

    expect(screen.getByText('4.00 left to allocate')).toBeTruthy();
  });

  it('warns when fixed amounts exceed the total', async () => {
    const overAmounts: SplitInput = {
      mode: 'amount',
      participants: [
        { userId: ada.id, amount: 800 },
        { userId: grace.id, amount: 400 },
      ],
    };
    await render(<Harness initial={overAmounts} amountCents={1000} />);

    expect(screen.getByText('2.00 over the total')).toBeTruthy();
  });
});
