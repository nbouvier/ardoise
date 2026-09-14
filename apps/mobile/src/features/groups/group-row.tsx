import type { GroupSummary } from '@splitcount/shared';
import { Pressable, StyleSheet, View } from 'react-native';

import { Breadcrumb } from '@/components/breadcrumb';
import { Card } from '@/components/card';
import { FavoriteStar } from '@/components/favorite-star';
import { MedallionBadge } from '@/components/medallion-badge';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { balanceTone, groupBalanceLabel } from '@/features/transactions/balance-display';

export interface GroupRowProps {
  group: GroupSummary;
  onPress: (group: GroupSummary) => void;
  onToggleFavorite: (group: GroupSummary) => void;
  /** Muted rendering for an archived group. */
  muted?: boolean;
  /** Disables the star while its own toggle request is in flight. */
  favoriteBusy?: boolean;
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
 * (`docs/specs/balances.md`). A group that sits under another leads with a
 * breadcrumb of its ancestors, so a list mixing depths — the home screen's
 * favorites (`docs/specs/home.md`) — never leaves a name ambiguous.
 */
export function GroupRow({
  group,
  onPress,
  onToggleFavorite,
  muted = false,
  favoriteBusy = false,
}: GroupRowProps) {
  const members = group.memberCount === 1 ? '1 member' : `${group.memberCount} members`;

  return (
    <Card muted={muted}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={group.name}
          onPress={() => onPress(group)}
          style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
          <MedallionBadge seed={group.id} content={initials(group.name)} />
          <View style={styles.text}>
            {/* Plain text, not tappable: the row itself opens the group, and
                a nested pressable here would steal that tap. */}
            <Breadcrumb ancestors={group.ancestors} />
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
        </Pressable>
        <FavoriteStar
          favorite={group.favorite}
          label={group.name}
          disabled={favoriteBusy}
          onToggle={() => onToggleFavorite(group)}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    // The star aligns with the name line specifically, not the row's full
    // height — the row also carries a member count and balance beneath it.
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.6,
  },
});
