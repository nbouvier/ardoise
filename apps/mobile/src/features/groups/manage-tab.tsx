import type { GroupDetail, GroupMember } from '@ardoise/shared';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { MeTag } from '@/components/me-tag';
import { TextAction } from '@/components/text-action';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { GroupNameField } from './group-name-field';
import { SectionHeader } from './section-header';

export interface ManageTabProps {
  group: GroupDetail;
  managed: boolean;
  /** Itself or an ancestor archived — gates what the server actually blocks. */
  readOnly: boolean;
  /** This group's whole tree is capped at a friendship's two people — hides "Add friends"/"Invite". */
  pairRooted: boolean;
  /** The group's own flag — drives the archive toggle's own label and action. */
  ownArchived: boolean;
  isOwner: boolean;
  alone: boolean;
  busy: boolean;
  viewerId: string | null;
  onInvite: () => void;
  /** Opens a placeholder member's actions; absent when there are none to offer. */
  onPlaceholderPress?: (member: GroupMember) => void;
  onRename: (name: string) => Promise<boolean>;
  onArchiveToggle: () => void;
  onLeave: () => void;
  onDelete: () => void;
}

/**
 * Who is in the group and what can be done to it: the member list, with the
 * way to bring more people in at its head, then the management actions.
 */
export function ManageTab({
  group,
  managed,
  readOnly,
  pairRooted,
  ownArchived,
  isOwner,
  alone,
  busy,
  viewerId,
  onInvite,
  onPlaceholderPress,
  onRename,
  onArchiveToggle,
  onLeave,
  onDelete,
}: ManageTabProps) {
  // The owner is always first; everyone else keeps the order the server sent
  // (alphabetical) — a stable sort only ever moves the one owner.
  const orderedMembers = [...group.members].sort((a, b) =>
    a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0,
  );

  return (
    // "handled" keeps the name field focused — and its just-typed draft
    // intact — when its own discard/checkmark are tapped: without it, the
    // scroll view blurs the field on the touch itself, before the button's
    // own `onPress` ever runs, discarding the draft a beat too early.
    <ScrollView contentContainerStyle={styles.manage} keyboardShouldPersistTaps="handled">
      <View style={styles.block}>
        <SectionHeader title="Group name" />
        <GroupNameField
          name={group.name}
          editable={managed && !readOnly}
          busy={busy}
          onRename={onRename}
        />
      </View>

      <View style={styles.block}>
        <SectionHeader
          title={`Members (${group.memberCount})`}
          action={
            managed && !readOnly && !pairRooted ? (
              <TextAction
                label="+ Invite"
                accessibilityLabel="Invite"
                disabled={busy}
                onPress={onInvite}
              />
            ) : null
          }
        />
        <Card style={styles.membersCard}>
          <View style={styles.members}>
            {orderedMembers.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                isViewer={member.id === viewerId}
                onPress={
                  member.placeholder && onPlaceholderPress
                    ? () => onPlaceholderPress(member)
                    : undefined
                }
              />
            ))}
          </View>
        </Card>
      </View>

      {managed ? (
        <View style={styles.actions}>
          {pairRooted ? (
            <ThemedText type="small" themeColor="textSecondary">
              Just the two of you here too — no one else can be added.
            </ThemedText>
          ) : null}

          {/* The owner cannot strand the others; alone, leaving is deleting. */}
          {!isOwner || alone ? (
            <Button label="Leave group" variant="secondary" disabled={busy} onPress={onLeave} />
          ) : null}

          <Button
            label={ownArchived ? 'Reopen group' : 'Archive group'}
            variant="secondary"
            busy={busy}
            onPress={onArchiveToggle}
          />

          {isOwner ? (
            <Button label="Delete group" variant="danger" disabled={busy} onPress={onDelete} />
          ) : null}
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          This is the space you share with {group.name}. It’s just the two of you — to include other
          people, create a group.
        </ThemedText>
      )}
    </ScrollView>
  );
}

/**
 * One member of the Manage tab's list. A placeholder member is tagged "Not on
 * Ardoise" in the neutral surface, and its row opens its own actions when
 * there are any (`docs/specs/placeholder-members.md`).
 */
function MemberRow({
  member,
  isViewer,
  onPress,
}: {
  member: GroupMember;
  isViewer: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();

  const content = (
    <>
      <Avatar name={member.name} picture={member.picture} size={36} seed={member.id} />
      <ThemedText style={styles.memberName}>{member.name}</ThemedText>
      <View style={styles.memberTags}>
        {member.role === 'owner' ? (
          <View style={[styles.memberTag, { backgroundColor: theme.primarySoft }]}>
            <ThemedText type="overline" themeColor="onPrimarySoft">
              Owner
            </ThemedText>
          </View>
        ) : null}
        {member.placeholder ? (
          <View style={[styles.memberTag, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="overline" themeColor="textSecondary">
              Not on Ardoise
            </ThemedText>
          </View>
        ) : null}
        {isViewer ? <MeTag /> : null}
      </View>
    </>
  );

  if (!onPress) {
    return <View style={styles.memberRow}>{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${member.name}, not on Ardoise`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.memberRow,
        styles.memberRowPressable,
        pressed && { backgroundColor: theme.primarySoft },
      ]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  manage: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  // A block's own header-then-content spacing — the same shape as the
  // sub-groups section on the Transactions tab.
  block: {
    gap: Spacing.two,
  },
  membersCard: {
    gap: Spacing.three,
  },
  members: {
    gap: Spacing.two,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  // A pressable row's wash reaches past the text, the space taken back so its
  // content stays aligned with the rows around it.
  memberRowPressable: {
    paddingHorizontal: Spacing.two,
    marginHorizontal: -Spacing.two,
    borderRadius: Radius.medium,
  },
  memberName: {
    flex: 1,
  },
  memberTags: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  memberTag: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  centeredText: {
    textAlign: 'center',
  },
});
