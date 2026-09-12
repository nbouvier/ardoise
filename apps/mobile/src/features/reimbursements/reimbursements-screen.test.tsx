import type { ReimbursementPlanResponse, ReimbursementScope } from '@splitcount/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ReimbursementsScreen } from './reimbursements-screen';

const ada = { id: 'ada', name: 'Ada Lovelace', picture: null };
const grace = { id: 'grace', name: 'Grace Hopper', picture: null };
const alan = { id: 'alan', name: 'Alan Turing', picture: null };
const members = [
  { ...ada, role: 'owner' as const },
  { ...grace, role: 'member' as const },
  { ...alan, role: 'member' as const },
];

const mockFetchReimbursements = jest.fn<
  (groupId: string, scope: ReimbursementScope) => Promise<ReimbursementPlanResponse>
>();
// Stable across renders, like the real memoised auth context: a fresh object
// per call would re-run the hook's effect forever.
const mockAuthContext = { authorizedFetch: jest.fn() };

jest.mock('@/features/auth/use-auth', () => ({
  useAuth: () => mockAuthContext,
}));

jest.mock('@/lib/api/transactions', () => ({
  fetchReimbursements: (_fetcher: unknown, groupId: string, scope: ReimbursementScope) =>
    mockFetchReimbursements(groupId, scope),
}));

/** Ada owes Alan 10.00, Grace came out even — the netted-chain plan. */
const chainPlan: ReimbursementPlanResponse = {
  scope: 'group',
  positions: [
    { user: alan, amountCents: 1000, sources: [] },
    { user: grace, amountCents: 0, sources: [] },
    { user: ada, amountCents: -1000, sources: [] },
  ],
  reimbursements: [{ from: ada, to: alan, amountCents: 1000 }],
};

const settledPlan: ReimbursementPlanResponse = {
  scope: 'group',
  positions: members.map((member) => ({
    user: { id: member.id, name: member.name, picture: null },
    amountCents: 0,
    sources: [],
  })),
  reimbursements: [],
};

beforeEach(() => {
  mockFetchReimbursements.mockReset();
});

async function renderScreen(
  plan: ReimbursementPlanResponse | Error,
  overrides: Partial<Parameters<typeof ReimbursementsScreen>[0]> = {},
) {
  if (plan instanceof Error) {
    mockFetchReimbursements.mockRejectedValue(plan);
  } else {
    mockFetchReimbursements.mockResolvedValue(plan);
  }
  return render(
    <ReimbursementsScreen
      groupId="group-1"
      hasSubgroups={false}
      members={members}
      viewerId={ada.id}
      readOnly={false}
      onRecord={jest.fn()}
      onClose={jest.fn()}
      {...overrides}
    />,
  );
}

describe('ReimbursementsScreen', () => {
  it('states each payment from the viewer’s point of view', async () => {
    await renderScreen(chainPlan);

    expect(await screen.findByRole('button', { name: 'You pay Alan Turing 10.00' })).toBeTruthy();
    expect(screen.getByText('One payment clears everything.')).toBeTruthy();
  });

  it('words a payment between two other people by name', async () => {
    await renderScreen(chainPlan, { viewerId: grace.id });

    expect(
      await screen.findByRole('button', { name: 'Ada Lovelace pays Alan Turing 10.00' }),
    ).toBeTruthy();
  });

  it('puts the viewer’s own payments first', async () => {
    await renderScreen(
      {
        scope: 'group',
        positions: chainPlan.positions,
        reimbursements: [
          { from: grace, to: alan, amountCents: 5000 },
          { from: ada, to: alan, amountCents: 1000 },
        ],
      },
      { viewerId: ada.id },
    );

    const buttons = await screen.findAllByRole('button');
    const labels = buttons.map((button) => button.props.accessibilityLabel);
    expect(labels.filter((label: unknown) => typeof label === 'string' && label.includes('pay'))).toEqual([
      'You pay Alan Turing 10.00',
      'Grace Hopper pays Alan Turing 50.00',
    ]);
  });

  it('records a suggested payment when it is tapped', async () => {
    const onRecord = jest.fn();
    await renderScreen(chainPlan, { onRecord });

    await fireEvent.press(await screen.findByRole('button', { name: 'You pay Alan Turing 10.00' }));

    expect(onRecord).toHaveBeenCalledWith({ from: ada, to: alan, amountCents: 1000 });
  });

  it('explains, rather than silently ignoring, a payment it cannot record', async () => {
    const onRecord = jest.fn();
    await renderScreen(chainPlan, { readOnly: true, onRecord });

    const row = await screen.findByRole('button', { name: 'You pay Alan Turing 10.00' });
    await fireEvent.press(row);

    expect(onRecord).not.toHaveBeenCalled();
    expect(screen.getByText('Reopen the group to record it.')).toBeTruthy();
  });

  it('says a former member’s payment cannot be recorded here', async () => {
    await renderScreen(chainPlan, { members: [members[0]!, members[1]!] });

    expect(
      await screen.findByText('Alan Turing has left this group, so this can’t be recorded here.'),
    ).toBeTruthy();
  });

  it('reads as settled when nobody owes anybody', async () => {
    await renderScreen(settledPlan);

    expect(await screen.findByText('You’re all settled up')).toBeTruthy();
    expect(screen.queryByText('Suggested reimbursements')).toBeNull();
  });

  it('shows where everyone stands, the viewer as “You”', async () => {
    await renderScreen(chainPlan);

    expect(await screen.findByRole('button', { name: 'You pay Alan Turing 10.00' })).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('−10.00')).toBeTruthy();
    expect(screen.getByText('+10.00')).toBeTruthy();
    expect(screen.getByText('settled up')).toBeTruthy();
  });

  it('keeps a position’s per-group breakdown collapsed until it is asked for', async () => {
    await renderScreen({
      scope: 'subtree',
      positions: [
        { user: grace, amountCents: 1000, sources: [] },
        {
          user: ada,
          amountCents: -1000,
          sources: [
            { groupId: 'corsica', groupName: 'Corsica', amountCents: -1500 },
            { groupId: 'group-1', groupName: 'Trip', amountCents: 500 },
          ],
        },
      ],
      reimbursements: [{ from: ada, to: grace, amountCents: 1000 }],
    });

    const details = await screen.findByRole('button', { name: 'You, −10.00' });
    expect(screen.queryByText('Corsica')).toBeNull();

    await fireEvent.press(details);

    expect(screen.getByText('Corsica')).toBeTruthy();
    expect(screen.getByText('−15.00')).toBeTruthy();
    expect(screen.getByText('Trip')).toBeTruthy();
    expect(screen.getByText('+5.00')).toBeTruthy();
  });

  it('includes sub-groups by default, and can be narrowed to the group alone', async () => {
    await renderScreen(chainPlan, { hasSubgroups: true });

    expect(await screen.findByRole('button', { name: 'You pay Alan Turing 10.00' })).toBeTruthy();
    expect(mockFetchReimbursements).toHaveBeenLastCalledWith('group-1', 'subtree');

    await fireEvent.press(screen.getByRole('button', { name: 'Include sub-groups' }));

    expect(mockFetchReimbursements).toHaveBeenLastCalledWith('group-1', 'group');
  });

  it('shows no sub-groups toggle for a group without any', async () => {
    await renderScreen(chainPlan);

    await screen.findByRole('button', { name: 'You pay Alan Turing 10.00' });
    expect(screen.queryByRole('button', { name: 'Include sub-groups' })).toBeNull();
    expect(mockFetchReimbursements).toHaveBeenCalledWith('group-1', 'group');
  });

  it('offers a retry on failure, and never reads as settled', async () => {
    await renderScreen(new Error('offline'));

    expect(
      await screen.findByText(
        'We couldn’t work out who owes what. Check your connection and try again.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('You’re all settled up')).toBeNull();

    mockFetchReimbursements.mockResolvedValue(chainPlan);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'You pay Alan Turing 10.00' })).toBeTruthy();
  });
});
