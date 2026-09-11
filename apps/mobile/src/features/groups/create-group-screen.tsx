import type { GroupDetail } from '@splitcount/shared';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { createGroup } from '@/lib/api/groups';
import { errorFields, logger } from '@/lib/logger';

import { FriendPicker } from './friend-picker';
import { groupsChanged } from './groups-changed';

export interface CreateGroupScreenProps {
  onCreated: (group: GroupDetail) => void;
  onCancel: () => void;
}

export function CreateGroupScreen({ onCreated, onCancel }: CreateGroupScreenProps) {
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
      });
      groupsChanged.notify();
      onCreated(group);
    } catch (cause: unknown) {
      logger.warn('groups.create.failed', errorFields(cause));
      setError('We couldn’t create the group. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">New group</ThemedText>

      <TextInput
        accessibilityLabel="Group name"
        placeholder="Trip, flatshare, night out…"
        placeholderTextColor={theme.textSecondary}
        autoFocus
        value={name}
        onChangeText={setName}
        maxLength={60}
        style={[
          styles.nameInput,
          { color: theme.text, backgroundColor: theme.backgroundElement },
        ]}
      />

      <ThemedText type="small" themeColor="textSecondary">
        Add friends now, or share a link later.
      </ThemedText>

      <FriendPicker selected={selected} onToggle={toggle} />

      {error ? (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}

      <ThemedView style={styles.actions}>
        <Button
          label="Create group"
          busy={busy}
          disabled={name.trim().length === 0}
          onPress={() => void handleCreate()}
        />
        <Button label="Cancel" variant="secondary" disabled={busy} onPress={onCancel} />
      </ThemedView>
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
  nameInput: {
    height: 52,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  error: {
    color: '#d64545',
  },
  actions: {
    gap: Spacing.two,
  },
});
