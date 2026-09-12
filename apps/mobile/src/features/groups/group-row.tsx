import type { GroupSummary } from '@splitcount/shared';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { MedallionBadge } from '@/components/medallion-badge';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { balanceTone, groupBalanceLabel } from '@/features/transactions/balance-display';

export interface GroupRowProps {
  group: GroupSummary;
  onPress: (group: GroupSummary) => void;
  /** Muted rendering for an archived group. */
  muted?: boolean;
}

/** The group's initials, so two cards in a list never look the same. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

/**
 * One card of the group list: its medallion, name, size, and where the viewer
 * stands in that group — its own transactions, not its sub-groups'
 * (`docs/specs/balances.md`).
 */
export function GroupRow({ group, onPress, muted = false }: GroupRowProps) {
  const members = group.memberCount === 1 ? '1 member' : `${group.memberCount} members`;

  return (
    <Card accessibilityLabel={group.name} onPress={() => onPress(group)} muted={muted}>
      <View style={styles.row}>
        <MedallionBadge seed={group.id} content={initials(group.name)} />
        <View style={styles.text}>
          <ThemedText type="sectionTitle" numberOfLines={1}>
            {group.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {muted ? `${members} · archived` : members}
          </ThemedText>
          <ThemedText type="smallBold" themeColor={balanceTone(group.viewerBalanceCents)}>
            {groupBalanceLabel(group.viewerBalanceCents)}
          </ThemedText>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
});
