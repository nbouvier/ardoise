import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Checkbox } from '@/components/checkbox';
import { DropdownMenu } from '@/components/dropdown-menu';
import { Icon } from '@/components/icon';
import { Pill } from '@/components/pill';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { sameSet } from '@/lib/sets';

/** A one-tap selection at the top of the menu. */
export interface SelectionPreset {
  label: string;
  ids: ReadonlySet<string>;
}

export interface MultiSelectFieldProps<T> {
  /** What is being picked, for the field's accessibility label ("Participants: …"). */
  name: string;
  /** The field's own text: what the current pick amounts to. */
  label: string;
  items: readonly T[];
  idOf: (item: T) => string;
  /** The option row's own content, before its checkbox. */
  renderItem: (item: T) => ReactNode;
  /** What each option row is read as. */
  itemLabel: (item: T) => string;
  presets: readonly SelectionPreset[];
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSetAll: (ids: ReadonlySet<string>) => void;
}

/**
 * A labelled, fixed-size pill naming the pick, opening a multi-select
 * dropdown — the presets first, then a checkbox row per item — rather than a
 * row of chips that would not fit a list of any size
 * (`docs/specs/group-statistics.md`). The menu stays open while ticking, so
 * several can be picked in one go; tapping outside closes it.
 */
export function MultiSelectField<T>({
  name,
  label,
  items,
  idOf,
  renderItem,
  itemLabel,
  presets,
  selectedIds,
  onToggle,
  onSetAll,
}: MultiSelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  // The first preset the pick matches exactly — "Everybody" over "Only you"
  // in a group of one.
  const current = presets.find((preset) => sameSet(preset.ids, selectedIds));

  return (
    <>
      <SelectField
        accessibilityLabel={`${name}: ${label}`}
        label={label}
        onPress={() => setOpen(true)}
      />
      <DropdownMenu visible={open} onClose={() => setOpen(false)}>
        <View style={styles.presets}>
          {presets.map((preset) => (
            <Pill
              key={preset.label}
              label={preset.label}
              selected={preset === current}
              onPress={() => onSetAll(preset.ids)}
            />
          ))}
        </View>

        <MenuOptions>
          {items.map((item) => (
            <Option
              key={idOf(item)}
              label={itemLabel(item)}
              selected={selectedIds.has(idOf(item))}
              onPress={() => onToggle(idOf(item))}>
              {renderItem(item)}
            </Option>
          ))}
        </MenuOptions>
      </DropdownMenu>
    </>
  );
}

/** The pill-shaped field that opens the dropdown. */
function SelectField({
  accessibilityLabel,
  label,
  onPress,
}: {
  accessibilityLabel: string;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.field,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
      ]}>
      <ThemedText numberOfLines={1} style={styles.fieldLabel}>
        {label}
      </ThemedText>
      <Icon name="collapse" size={16} color={theme.textSecondary} />
    </Pressable>
  );
}

/**
 * The dropdown's option rows. Scrolls past half the screen's height, so a
 * long list stays inside the menu — and the menu inside the screen.
 */
function MenuOptions({ children }: { children: ReactNode }) {
  const { height } = useWindowDimensions();

  return (
    <ScrollView style={{ maxHeight: height * 0.5 }} contentContainerStyle={styles.options}>
      {children}
    </ScrollView>
  );
}

function Option({
  label,
  selected,
  onPress,
  children,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected && { backgroundColor: theme.primarySoft },
        pressed && styles.pressed,
      ]}>
      <View style={styles.optionContent}>{children}</View>
      <Checkbox checked={selected} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    gap: Spacing.two,
    height: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  fieldLabel: {
    flexShrink: 1,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.one,
  },
  options: {
    gap: Spacing.one,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.medium,
  },
  optionContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  pressed: {
    opacity: 0.6,
  },
});
