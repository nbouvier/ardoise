import type { GroupDetail } from '@ardoise/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { FriendPickerCard } from './friend-picker';
import { GroupInviteScreen } from './group-invite-screen';

export interface InvitePanelProps {
  group: GroupDetail;
  busy: boolean;
  onAdd: (memberIds: string[]) => void;
  onClose: () => void;
}

/**
 * What "+ Invite" swaps the Manage tab's content for: both ways to bring
 * someone in, on one page. Pick from your friends up top (the list scrolls when
 * it runs out of room, and "Add to group" follows it up when it doesn't), and
 * the group's invitation link, for anyone else, sits at the bottom.
 */
export function InvitePanel({ group, busy, onAdd, onClose }: InvitePanelProps) {
  const theme = useTheme();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const members = new Set(group.members.map((member) => member.id));

  return (
    <View style={styles.panel}>
      <View style={styles.friends}>
        <ThemedText type="overline" themeColor="textSecondary">
          Add friends
        </ThemedText>
        <FriendPickerCard
          selected={selected}
          onToggle={(id) =>
            setSelected((current) => {
              const next = new Set(current);
              if (!next.delete(id)) {
                next.add(id);
              }
              return next;
            })
          }
          lockedIds={members}
        />
        <Button
          label="Add to group"
          busy={busy}
          disabled={selected.size === 0}
          onPress={() => onAdd([...selected])}
        />
      </View>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <View style={styles.link}>
        <GroupInviteScreen groupId={group.id} groupName={group.name} embedded />
      </View>

      <Button label="Done" variant="secondary" onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    paddingBottom: Spacing.six,
  },
  // Takes the room the link leaves; the list scrolls inside it.
  friends: {
    flex: 1,
    gap: Spacing.two,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.five,
  },
  link: {
    flexShrink: 0,
    marginBottom: Spacing.five,
  },
});
