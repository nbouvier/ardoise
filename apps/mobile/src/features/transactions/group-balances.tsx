import type { GroupMember } from '@splitcount/shared';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { centsToText } from './amount-input';
import { balanceTone, groupBalanceLabel } from './balance-display';
import type { UseBalancesResult } from './use-balances';

export interface GroupBalancesProps {
  /** Loaded by the group screen, so one read serves the summary and this list. */
  result: UseBalancesResult;
  /** The group's current members, to put a name and a face on a balance. */
  members: GroupMember[];
}

/**
 * Where the viewer stands against the group, in one line — the answer to
 * "what do I owe here" without opening the details sheet. `amountCents` is
 * the group's `viewerBalanceCents`: for a group with sub-groups this is
 * already rolled up over the whole sub-tree (`docs/specs/balances.md`), and
 * it travels with the group itself, so there is no separate loading state to
 * wait on here — unlike the per-member list below, which stays scoped to
 * this one group and has its own.
 */
export function ViewerBalance({ amountCents }: { amountCents: number }) {
  return (
    <ThemedText type="smallBold" themeColor={balanceTone(amountCents)}>
      {groupBalanceLabel(amountCents)}
    </ThemedText>
  );
}

/**
 * Each member's net balance: positive is owed to them, negative is what they
 * owe. A member who has since left the group can still appear here, with an
 * unsettled balance from before they left — they just have no current
 * membership to read a name from.
 */
export function GroupBalances({ result, members }: GroupBalancesProps) {
  const { status, balances, refresh } = result;
  const theme = useTheme();
  const byId = new Map(members.map((member) => [member.id, member]));

  if (status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator testID="balances-loading" color={theme.text} />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.centered}>
        <ThemedText themeColor="textSecondary" style={styles.centeredText}>
          We couldn’t load the balances.
        </ThemedText>
        <Button label="Try again" variant="secondary" onPress={refresh} />
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {balances.map((balance) => {
        const member = byId.get(balance.userId);
        return (
          <View key={balance.userId} style={styles.row}>
            {member ? (
              <Avatar name={member.name} picture={member.picture} size={32} />
            ) : (
              <View style={[styles.placeholder, { borderColor: theme.textSecondary }]} />
            )}
            <ThemedText style={styles.name} numberOfLines={1}>
              {member?.name ?? 'Former member'}
            </ThemedText>
            <ThemedText type="smallBold" themeColor={balanceTone(balance.amountCents)}>
              {balance.amountCents === 0
                ? 'settled up'
                : `${balance.amountCents > 0 ? '+' : '−'}${centsToText(Math.abs(balance.amountCents))}`}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  centeredText: {
    textAlign: 'center',
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  placeholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  name: {
    flex: 1,
  },
});
