import type { GroupDetail } from '@splitcount/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/use-auth';
import { createGroup } from '@/lib/api/groups';
import { errorFields, logger } from '@/lib/logger';

import { FriendPicker } from './friend-picker';
import { groupsChanged } from './groups-changed';

export interface CreateGroupScreenProps {
  onCreated: (group: GroupDetail) => void;
  onCancel: () => void;
  /**
   * Creates a sub-group under this group instead of a root group
   * (`docs/specs/groups.md`). The parent is implicit — there is no field for
   * it, since this screen is only ever opened from inside that parent.
   */
  parentId?: string;
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
  onCancel,
  parentId,
  pairRooted = false,
}: CreateGroupScreenProps) {
  const { authorizedFetch } = useAuth();
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
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">{parentId ? 'New sub-group' : 'New group'}</ThemedText>

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
          <FriendPicker selected={selected} onToggle={toggle} />
        </>
      )}

      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={parentId ? 'Create sub-group' : 'Create group'}
          busy={busy}
          disabled={name.trim().length === 0}
          onPress={() => void handleCreate()}
        />
        <Button label="Cancel" variant="ghost" disabled={busy} onPress={onCancel} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  actions: {
    gap: Spacing.two,
  },
});
