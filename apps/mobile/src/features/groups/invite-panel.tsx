import type { ClaimablePlaceholder, GroupDetail } from '@ardoise/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { fetchPlaceholders } from '@/lib/api/groups';
import { errorFields, logger } from '@/lib/logger';
import { toggleInSet } from '@/lib/sets';

import { FriendPickerCard } from './friend-picker';
import { GroupInviteScreen } from './group-invite-screen';
import { OtherParticipants } from './other-participants';

export interface InvitePanelProps {
  group: GroupDetail;
  busy: boolean;
  /** Friends and the tree's placeholders by id, new placeholders by name. */
  onAdd: (people: { memberIds: string[]; placeholderNames: string[] }) => void;
  onClose: () => void;
}

/**
 * What "+ Invite" swaps the Manage tab's content for: every way to bring
 * someone in, on one page. Pick from your friends up top (the list scrolls when
 * it runs out of room), add people by name below it — placeholder members,
 * including the tree's ones not in this group yet
 * (`docs/specs/placeholder-members.md`) — and "Add to group" follows them up.
 * The group's invitation link, for anyone else, sits at the bottom.
 */
export function InvitePanel({ group, busy, onAdd, onClose }: InvitePanelProps) {
  const theme = useTheme();
  const { authorizedFetch } = useAuth();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [placeholderNames, setPlaceholderNames] = useState<string[]>([]);
  const [treePlaceholders, setTreePlaceholders] = useState<readonly ClaimablePlaceholder[]>([]);
  const members = new Set(group.members.map((member) => member.id));

  // The tree's placeholders, so a sub-group can take its parent's. Without
  // them the page still works: only new names can be added then.
  useEffect(() => {
    let live = true;
    fetchPlaceholders(authorizedFetch, group.id)
      .then(({ placeholders }) => {
        if (live) {
          setTreePlaceholders(placeholders);
        }
      })
      .catch((error: unknown) => logger.warn('groups.placeholders.load.failed', errorFields(error)));
    return () => {
      live = false;
    };
  }, [authorizedFetch, group.id]);

  function toggle(id: string) {
    setSelected((current) => toggleInSet(current, id));
  }

  const nothingToAdd = selected.size === 0 && placeholderNames.length === 0;

  return (
    <View style={styles.panel}>
      <View style={styles.friends}>
        <ThemedText type="overline" themeColor="textSecondary">
          Add friends
        </ThemedText>
        <FriendPickerCard selected={selected} onToggle={toggle} lockedIds={members} />
        <OtherParticipants
          names={placeholderNames}
          onNamesChange={setPlaceholderNames}
          available={treePlaceholders.filter((placeholder) => !members.has(placeholder.id))}
          selectedIds={selected}
          onToggle={toggle}
          takenNames={treePlaceholders.map((placeholder) => placeholder.name)}
          disabled={busy}
        />
        <Button
          label="Add to group"
          busy={busy}
          disabled={nothingToAdd}
          onPress={() => onAdd({ memberIds: [...selected], placeholderNames })}
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
