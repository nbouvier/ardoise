import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/icon-button';
import { Pill } from '@/components/pill';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The server's own limit on a placeholder's name. */
const MAX_NAME_LENGTH = 60;

export interface OtherParticipantsProps {
  /** New names, in the order they were added. */
  names: readonly string[];
  onNamesChange: (names: string[]) => void;
  /**
   * Placeholders of the tree that could be brought into this group too — a
   * sub-group's parent's (`docs/specs/placeholder-members.md`).
   */
  available?: readonly { id: string; name: string }[];
  selectedIds?: ReadonlySet<string>;
  onToggle?: (id: string) => void;
  /** Names the tree already has, refused here before the server does. */
  takenNames?: readonly string[];
  disabled?: boolean;
}

/**
 * "Add other participants": people known by name only, for anyone not on
 * Ardoise yet — or never (`docs/specs/placeholder-members.md`). A name is
 * typed and added, as often as needed; each added one is a pill, tapped to
 * take it back off. A sub-group also offers its parent's placeholders, as
 * pills to select.
 */
export function OtherParticipants({
  names,
  onNamesChange,
  available = [],
  selectedIds = new Set(),
  onToggle,
  takenNames = [],
  disabled = false,
}: OtherParticipantsProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  function add() {
    const name = draft.trim();
    if (name.length === 0) {
      return;
    }
    const lower = name.toLowerCase();
    const known = [...names, ...takenNames, ...available.map((placeholder) => placeholder.name)];
    if (known.some((other) => other.toLowerCase() === lower)) {
      setProblem(`There’s already someone called ${name} here.`);
      return;
    }
    onNamesChange([...names, name]);
    setDraft('');
    setProblem(null);
  }

  return (
    <View style={styles.section}>
      <ThemedText type="overline" themeColor="textSecondary">
        Add other participants
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        For people not on Ardoise yet. When they join, they can say it’s them.
      </ThemedText>

      {available.length > 0 ? (
        <View style={styles.pills}>
          {available.map((placeholder) => (
            <Pill
              key={placeholder.id}
              role="checkbox"
              label={placeholder.name}
              selected={selectedIds.has(placeholder.id)}
              onPress={() => onToggle?.(placeholder.id)}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.entry}>
        <TextField
          accessibilityLabel="Participant name"
          placeholder="Name"
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            setProblem(null);
          }}
          onSubmitEditing={add}
          submitBehavior="submit"
          returnKeyType="done"
          maxLength={MAX_NAME_LENGTH}
          editable={!disabled}
          style={styles.field}
        />
        <IconButton
          icon="plus"
          accessibilityLabel="Add participant"
          color={theme.primary}
          disabled={disabled || draft.trim().length === 0}
          onPress={add}
        />
      </View>

      {problem ? (
        <ThemedText type="small" themeColor="danger">
          {problem}
        </ThemedText>
      ) : null}

      {names.length > 0 ? (
        <View style={styles.pills}>
          {names.map((name) => (
            <Pill
              key={name}
              label={`${name} ✕`}
              accessibilityLabel={`Remove ${name}`}
              selected
              onPress={() => onNamesChange(names.filter((other) => other !== name))}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  field: {
    flex: 1,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
