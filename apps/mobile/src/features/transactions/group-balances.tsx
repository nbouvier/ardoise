import { ThemedText } from '@/components/themed-text';

import { balanceTone, groupBalanceLabel } from './balance-display';

/**
 * Where the viewer stands against the group, in one line — the answer to
 * "what do I owe here" at the top of the Balances tab. `amountCents` is
 * the group's `viewerBalanceCents` — this group's own transactions, never a
 * sub-group's (`docs/specs/balances.md`) — and it travels with the group
 * itself, so there is no separate loading state to wait on here, unlike the
 * per-member standings below it.
 */
export function ViewerBalance({ amountCents }: { amountCents: number }) {
  return (
    <ThemedText type="amount" themeColor={balanceTone(amountCents)}>
      {groupBalanceLabel(amountCents)}
    </ThemedText>
  );
}
