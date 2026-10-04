import type { FriendSummary, SplitInput } from '@ardoise/shared';
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
  viewerId = null,
}: {
  initial: SplitInput;
  amountCents?: number;
  viewerId?: string | null;
}) {
  const [value, setValue] = useState<SplitInput>(initial);
  return (
    <SplitEditor
      members={members}
      amountCents={amountCents}
      value={value}
      onChange={setValue}
      viewerId={viewerId}
    />
  );
}

const equalShares: SplitInput = {
  mode: 'shares',
  participants: [
    { userId: ada.id, weight: 1 },
    { userId: grace.id, weight: 1 },
  ],
};

describe('SplitEditor', () => {
  it('shows every member, concerned or not, each with its own stepper', async () => {
    await render(<Harness initial={equalShares} />);

    // Alan is not concerned yet, but his row (and stepper) still shows,
    // starting at zero — fields stay visible rather than disappearing.
    const values = screen.getAllByText('0');
    expect(values).toHaveLength(1);
  });

  it('marks the viewer’s row "Me"', async () => {
    await render(<Harness initial={equalShares} viewerId={grace.id} />);

    expect(screen.getByText('Me')).toBeTruthy();
  });

  it('pins the viewer’s row first, even when they are last in the member list', async () => {
    const allAmounts: SplitInput = {
      mode: 'amount',
      participants: [
        { userId: ada.id, amount: 300 },
        { userId: grace.id, amount: 300 },
        { userId: alan.id, amount: 400 },
      ],
    };
    // Alan is third in `members`, but the viewer — his row should lead.
    await render(<Harness initial={allAmounts} viewerId={alan.id} />);

    const amountFields = screen.getAllByLabelText(/’s amount$/);
    expect(amountFields[0]).toHaveProp('accessibilityLabel', 'Alan Turing’s amount');
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

  it('selects a member by raising their weight from zero', async () => {
    await render(<Harness initial={equalShares} amountCents={1000} />);

    // Alan is the third row, not concerned yet — his preview reads zero.
    expect(screen.getByText('= 0.00')).toBeTruthy();

    await fireEvent.press(screen.getAllByRole('button', { name: 'Increase weight' })[2]!);

    // Now a three-way equal split: 3.34 / 3.33 / 3.33 (remainder to Ada).
    expect(screen.queryByText('= 0.00')).toBeNull();
  });

  it('deselects a member by dropping their weight to zero, then blocks further decrease', async () => {
    await render(<Harness initial={equalShares} />);

    const decreaseButtons = screen.getAllByRole('button', { name: 'Decrease weight' });
    // Ada starts at weight 1 — concerned — so decreasing is allowed.
    expect(decreaseButtons[0]).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ disabled: false }),
    );

    await fireEvent.press(decreaseButtons[0]!);

    // Dropped to zero: she is no longer concerned, and can't go lower.
    expect(screen.getAllByRole('button', { name: 'Decrease weight' })[0]).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ disabled: true }),
    );
  });

  it('seeds fixed amounts from the shares preview when switching modes', async () => {
    await render(<Harness initial={equalShares} amountCents={1000} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Fixed' }));

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

  it('deselects a member by clearing their fixed amount to zero', async () => {
    const partialAmounts: SplitInput = {
      mode: 'amount',
      participants: [
        { userId: ada.id, amount: 400 },
        { userId: grace.id, amount: 600 },
      ],
    };
    await render(<Harness initial={partialAmounts} amountCents={1000} />);

    await fireEvent.changeText(screen.getByLabelText('Ada Lovelace’s amount'), '0');

    expect(screen.getByText('4.00 left to allocate')).toBeTruthy();
  });
});
