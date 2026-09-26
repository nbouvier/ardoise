import type { GroupAncestor, GroupDetail } from '@splitcount/shared';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { DismissiblePage } from '@/components/dismissible-page';
import { Breadcrumb } from '@/components/breadcrumb';
import { Button } from '@/components/button';
import { OrDivider } from '@/components/or-divider';
import { ScreenHeader } from '@/components/screen-header';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/use-auth';
import { InvitationCodeEntry } from '@/features/invites/invitation-code-entry';
import { useTheme } from '@/hooks/use-theme';
import { createGroup } from '@/lib/api/groups';
import { errorFields, logger } from '@/lib/logger';

import { FriendPickerCard } from './friend-picker';
import { groupsChanged } from './groups-changed';

export interface CreateGroupScreenProps {
  onCreated: (group: GroupDetail) => void;
  /** Folds the page away — the banner’s chevron; also after a code is handed off. */
  onClose: () => void;
  /**
   * Creates a sub-group under this group instead of a root group
   * (`docs/specs/groups.md`). The parent is implicit — there is no field for
   * it, since this screen is only ever opened from inside that parent.
   */
  parentId?: string;
  /** Where the new sub-group will sit — the parent and its ancestors, root first — shown above the title. */
  parentTrail?: readonly GroupAncestor[];
  /**
   * The parent is a pair group, or is itself nested under one — the new
   * sub-group can only ever contain that friendship's own two people, so
   * there is no one to offer in a friend picker (`docs/specs/groups.md`). The
   * other person joins it themselves from the parent's sub-groups list.
   */
  pairRooted?: boolean;
}

export function CreateGroupScreen({
  onCreated,
  onClose,
  parentId,
  parentTrail = [],
  pairRooted = false,
}: CreateGroupScreenProps) {
  const { authorizedFetch } = useAuth();
  const theme = useTheme();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(friendId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(friendId)) {
        next.add(friendId);
      }
      return next;
    });
  }

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const group = await createGroup(authorizedFetch, {
        name: name.trim(),
        memberIds: [...selected],
        parentId,
      });
      groupsChanged.notify();
      onCreated(group);
    } catch (cause: unknown) {
      logger.warn('groups.create.failed', errorFields(cause));
      setError(
        parentId
          ? 'We couldn’t create the sub-group. Check your connection and try again.'
          : 'We couldn’t create the group. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <DismissiblePage
      onClose={onClose}
      style={{ backgroundColor: theme.background }}
      header={
        <ScreenHeader
          title="New group"
          above={<Breadcrumb ancestors={parentTrail} />}
          wash
          action={<BackButton icon="collapse" label="Close" onPress={onClose} />}
        />
      }>
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.page}>
          <View style={styles.create}>
            {parentId ? null : (
              <ThemedText type="overline" themeColor="textSecondary">
                Create a group
              </ThemedText>
            )}

            <TextField
              accessibilityLabel="Group name"
              placeholder="Trip, flatshare, night out…"
              autoFocus
              value={name}
              onChangeText={setName}
              maxLength={60}
            />

            {pairRooted ? (
              <ThemedText type="small" themeColor="textSecondary">
                Just the two of you here too — no one else can be added.
              </ThemedText>
            ) : (
              <>
                <ThemedText type="small" themeColor="textSecondary">
                  Add friends now, or share a link later.
                </ThemedText>
                <FriendPickerCard selected={selected} onToggle={toggle} />
              </>
            )}

            {error ? (
              <ThemedText type="small" themeColor="danger">
                {error}
              </ThemedText>
            ) : null}

            <Button
              label={parentId ? 'Create sub-group' : 'Create group'}
              busy={busy}
              disabled={name.trim().length === 0}
              onPress={() => void handleCreate()}
            />
          </View>

          {/* A sub-group is only ever made from inside its parent: there is
              nothing to join from here. */}
          {parentId ? null : (
            <>
              <OrDivider />
              <InvitationCodeEntry title="Join a group" onSubmitted={onClose} />
            </>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </DismissiblePage>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
  },
  page: {
    flex: 1,
  },
  // Takes the room the join part leaves; the friend list scrolls inside it.
  create: {
    flex: 1,
    gap: Spacing.three,
  },
});
