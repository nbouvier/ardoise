import type { FriendSummary, SplitInput } from '@ardoise/shared';
import { describe, expect, it, jest } from '@jest/globals';
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
  onValue,
}: {
  initial: SplitInput;
  amountCents?: number;
  viewerId?: string | null;
  /** Called with every value the editor emits, to assert on the split it builds. */
  onValue?: (value: SplitInput) => void;
}) {
  const [value, setValue] = useState<SplitInput>(initial);
  return (
    <SplitEditor
      members={members}
      amountCents={amountCents}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
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
    // starting at zero — fields stay visible rather than disappearing. So
    // does Others', the row after every member.
    const values = screen.getAllByText('0');
    expect(values).toHaveLength(2);
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

    // Alan is the third row, not concerned yet — his preview reads zero, and
    // so does Others' below him.
    expect(screen.getAllByText('= 0.00')).toHaveLength(2);

    await fireEvent.press(screen.getAllByRole('button', { name: 'Increase weight' })[2]!);

    // Now a three-way equal split: 3.34 / 3.33 / 3.33 (remainder to Ada).
    expect(screen.getAllByText('= 0.00')).toHaveLength(1);
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

  describe('Others', () => {
    it('is the last row, after every member, with its secondary line', async () => {
      await render(<Harness initial={equalShares} viewerId={ada.id} />);

      expect(screen.getByText('Others')).toBeTruthy();
      expect(screen.getByText('People outside the group')).toBeTruthy();

      // Four rows (three members, then Others), each with its own stepper.
      const increase = screen.getAllByRole('button', { name: 'Increase weight' });
      expect(increase).toHaveLength(4);
    });

    it('is the last row in fixed mode too, and never marked "Me"', async () => {
      const allAmounts: SplitInput = {
        mode: 'amount',
        participants: [{ userId: ada.id, amount: 1000 }],
      };
      await render(<Harness initial={allAmounts} viewerId={ada.id} />);

      const amountFields = screen.getAllByLabelText(/ amount$/);
      expect(amountFields).toHaveLength(4);
      expect(amountFields[3]).toHaveProp('accessibilityLabel', 'Others’ amount');
      expect(screen.getAllByText('Me')).toHaveLength(1);
    });

    it('stays last even when the viewer is pinned first', async () => {
      const allAmounts: SplitInput = { mode: 'amount', participants: [] };
      await render(<Harness initial={allAmounts} viewerId={alan.id} />);

      const labels = screen
        .getAllByLabelText(/ amount$/)
        .map((field) => field.props.accessibilityLabel);
      expect(labels).toEqual([
        'Alan Turing’s amount',
        'Ada Lovelace’s amount',
        'Grace Hopper’s amount',
        'Others’ amount',
      ]);
    });

    it('is not concerned until it is given a weight', async () => {
      await render(<Harness initial={equalShares} amountCents={1000} />);

      // Alan and Others are both at zero.
      expect(screen.getAllByText('= 0.00')).toHaveLength(2);
    });

    it('is added as userId null by raising its weight, and removed at zero', async () => {
      const onValue = jest.fn<(value: SplitInput) => void>();
      await render(<Harness initial={equalShares} amountCents={1000} onValue={onValue} />);

      const othersIncrease = () => screen.getAllByRole('button', { name: 'Increase weight' })[3]!;
      await fireEvent.press(othersIncrease());
      await fireEvent.press(othersIncrease());

      expect(onValue).toHaveBeenLastCalledWith({
        mode: 'shares',
        participants: [
          { userId: ada.id, weight: 1 },
          { userId: grace.id, weight: 1 },
          { userId: null, weight: 2 },
        ],
      });
      // 1 : 1 : 2 of 10.00.
      expect(screen.getByText('= 5.00')).toBeTruthy();

      const othersDecrease = () => screen.getAllByRole('button', { name: 'Decrease weight' })[3]!;
      await fireEvent.press(othersDecrease());
      await fireEvent.press(othersDecrease());

      expect(onValue).toHaveBeenLastCalledWith({
        mode: 'shares',
        participants: [
          { userId: ada.id, weight: 1 },
          { userId: grace.id, weight: 1 },
        ],
      });
    });

    it('takes a fixed amount as userId null, and counts it in what is left to allocate', async () => {
      const onValue = jest.fn<(value: SplitInput) => void>();
      const partialAmounts: SplitInput = {
        mode: 'amount',
        participants: [{ userId: ada.id, amount: 400 }],
      };
      await render(<Harness initial={partialAmounts} amountCents={1000} onValue={onValue} />);

      expect(screen.getByText('6.00 left to allocate')).toBeTruthy();

      await fireEvent.changeText(screen.getByLabelText('Others’ amount'), '6');

      expect(onValue).toHaveBeenLastCalledWith({
        mode: 'amount',
        participants: [
          { userId: ada.id, amount: 400 },
          { userId: null, amount: 600 },
        ],
      });
      expect(screen.getByText('Fully allocated')).toBeTruthy();

      await fireEvent.changeText(screen.getByLabelText('Others’ amount'), '0');

      expect(onValue).toHaveBeenLastCalledWith({
        mode: 'amount',
        participants: [{ userId: ada.id, amount: 400 }],
      });
    });

    it('carries an Others share over when switching from shares to fixed amounts', async () => {
      const onValue = jest.fn<(value: SplitInput) => void>();
      const withOthers: SplitInput = {
        mode: 'shares',
        participants: [
          { userId: ada.id, weight: 1 },
          { userId: null, weight: 1 },
        ],
      };
      await render(<Harness initial={withOthers} amountCents={1000} onValue={onValue} />);

      await fireEvent.press(screen.getByRole('button', { name: 'Fixed' }));

      expect(onValue).toHaveBeenLastCalledWith({
        mode: 'amount',
        participants: [
          { userId: ada.id, amount: 500 },
          { userId: null, amount: 500 },
        ],
      });
    });

    it('lets Others be the only participant', async () => {
      const onValue = jest.fn<(value: SplitInput) => void>();
      const nobody: SplitInput = { mode: 'shares', participants: [] };
      await render(<Harness initial={nobody} amountCents={1000} onValue={onValue} />);

      await fireEvent.press(screen.getAllByRole('button', { name: 'Increase weight' })[3]!);

      expect(onValue).toHaveBeenLastCalledWith({
        mode: 'shares',
        participants: [{ userId: null, weight: 1 }],
      });
      expect(screen.getByText('= 10.00')).toBeTruthy();
    });
  });
});
