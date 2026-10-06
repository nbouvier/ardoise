import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { IconButton } from '@/components/icon-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTimeout } from '@/hooks/use-timeout';

// How long the checkmark's confirming tilt (and the state it holds) stays up
// before it fades away — a beat longer than the wobble itself so the
// confirmation actually reads.
const NAME_CONFIRM_HOLD_MS = 900;
// How long an unsaved change sits blurred before the "not saved" hint
// actually shows — long enough that tapping straight back in to keep editing
// never sees it flash.
const NAME_UNSAVED_HINT_DELAY_MS = 400;

export interface GroupNameFieldProps {
  name: string;
  /** Whether the group can be renamed at all — absent, the field is purely informational. */
  editable: boolean;
  busy: boolean;
  onRename: (name: string) => Promise<boolean>;
}

/**
 * The group's name, always editable in place: tapping directly into the
 * field is the only way in, no separate edit button — its own checkmark
 * fades in at its end (inside it, not beside it) the moment it's focused,
 * even before anything has changed, and a discard (cross) joins it, to its
 * left, only once the name actually differs from the saved one. Committing
 * only ever happens on the checkmark or the keyboard's own submit, never on
 * losing focus: that neither saves nor discards, so a change left
 * un-validated just sits there — checkmark, cross and all — until it's
 * either committed or discarded, with a small note underneath while it does.
 * The checkmark still does its small confirming tilt, held a moment before
 * it fades away (`docs/DESIGN.md`).
 */
export function GroupNameField({ name, editable, busy, onRename }: GroupNameFieldProps) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  // Guards `commit` against being invoked twice at once (e.g. a fast double
  // tap on the checkmark) while a request is already in flight.
  const savingRef = useRef(false);
  // The pending delay between losing focus and the unsaved hint actually
  // showing — cleared whenever that hint no longer applies (refocusing,
  // discarding, committing) before it gets the chance to fire.
  const hintTimeout = useTimeout();
  // How long the checkmark stays up after a successful rename.
  const confirmTimeout = useTimeout();
  // Real focus state — tapping directly into or away from the field, plus
  // the discard/commit actions setting it directly rather than waiting on a
  // blur event a real device may fire late, or not at all here (see the
  // mobile-testing memory on native focus commands not round-tripping).
  const [hasFocus, setHasFocus] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [hintDue, setHintDue] = useState(false);
  const [draft, setDraft] = useState(name);
  const rotation = useSharedValue(0);

  // A change sitting in the field that hasn't been sent yet — independent of
  // focus, since losing focus must neither save nor discard it.
  const dirty = draft.trim() !== name;
  // The checkmark shows for as long as there's something to act on: the
  // field is focused, or a change is waiting un-validated. It also stays up
  // through a successful confirmation so its tilt has time to play out, even
  // once focus and dirtiness have both cleared.
  const showCheckmark = hasFocus || dirty || confirmed;
  // The cross only makes sense once there's an actual unsaved change to
  // throw away — showing it just because the field has focus, with nothing
  // typed differently yet, would offer to discard nothing.
  const showDiscard = dirty && !confirmed;
  // Only once its own short delay (`clearHintTimeout`'s counterpart, started
  // on blur) has actually elapsed — a change abandoned by tapping straight
  // back in doesn't deserve a flash of "not saved" on the way past.
  const showUnsavedHint = hintDue && dirty && !hasFocus && !confirmed;

  const clearHintTimeout = hintTimeout.clear;

  function handleFocus() {
    clearHintTimeout();
    setHintDue(false);
    setHasFocus(true);
  }

  // Losing focus on its own — tapping elsewhere, not the checkmark or the
  // keyboard's own submit — neither saves nor discards; the draft just sits
  // there until acted on. The "not saved" hint waits its own short delay
  // rather than appearing the instant focus goes, so a quick tap back into
  // the field to keep editing doesn't flash it for no reason.
  function handleBlur() {
    setHasFocus(false);
    hintTimeout.schedule(() => setHintDue(true), NAME_UNSAVED_HINT_DELAY_MS);
  }

  function discard() {
    clearHintTimeout();
    setHintDue(false);
    setDraft(name);
    setHasFocus(false);
    inputRef.current?.blur();
  }

  async function commit() {
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    try {
      clearHintTimeout();
      setHintDue(false);
      const trimmed = draft.trim();
      if (trimmed.length === 0 || trimmed === name) {
        setDraft(name);
        setHasFocus(false);
        inputRef.current?.blur();
        return;
      }
      const success = await onRename(trimmed);
      if (!success) {
        return;
      }
      setDraft(trimmed);
      setConfirmed(true);
      rotation.set(
        withSequence(
          withTiming(-12, { duration: 70 }),
          withTiming(12, { duration: 100 }),
          withTiming(0, { duration: 90 }),
        ),
      );
      setHasFocus(false);
      inputRef.current?.blur();
      confirmTimeout.schedule(() => setConfirmed(false), NAME_CONFIRM_HOLD_MS);
    } finally {
      savingRef.current = false;
    }
  }

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.get()}deg` }],
  }));

  return (
    <View>
      <View style={styles.row}>
        <TextField
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          editable={editable && !busy}
          maxLength={60}
          style={styles.input}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onSubmitEditing={() => void commit()}
        />
        {editable && showCheckmark ? (
          <View style={styles.actions} pointerEvents="box-none">
            <Animated.View
              entering={FadeIn.duration(150)}
              exiting={FadeOut.duration(120)}
              style={styles.actionsGroup}>
              {showDiscard ? (
                <IconButton
                  icon="close"
                  accessibilityLabel="Discard change"
                  color={theme.primary}
                  disabled={busy}
                  onPress={discard}
                />
              ) : null}
              <Animated.View style={iconStyle}>
                <IconButton
                  icon="check"
                  accessibilityLabel="Save group name"
                  color={theme.primary}
                  disabled={busy}
                  onPress={() => void commit()}
                />
              </Animated.View>
            </Animated.View>
          </View>
        ) : null}
      </View>
      {editable ? (
        // Its own fixed-height slot, always present, so the hint showing or
        // not never changes the field block's overall height — the icon
        // crossfade above already has its own timing to juggle; the field
        // settling into a taller "two lines" shape for a beat while that
        // plays out was this row's height moving too, on top of it.
        <View style={styles.hintSlot}>
          {showUnsavedHint ? (
            <ThemedText type="small" themeColor="danger" style={styles.hintText}>
              Change not saved yet
            </ThemedText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The row the icons overlay: its action icons sit inside it, overlaid on
  // its right edge, rather than in a row alongside it. The unsaved-hint slot
  // is kept apart, below it, so this row's height (and the icons stretched to
  // fill it) is only ever the input's own height, never that plus the hint's.
  row: {
    position: 'relative',
  },
  input: {
    // Room for two icon buttons, the gap between them, and their inset from
    // the field's own edge.
    paddingRight: 84,
  },
  actions: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: Spacing.two,
    justifyContent: 'center',
  },
  actionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  // Fixed at one line of `hintText` plus its gap from the field, whether or
  // not the hint itself is showing.
  hintSlot: {
    height: 16 + Spacing.one,
    justifyContent: 'flex-end',
  },
  // Deliberately smaller than the "small" text style it's layered on — a
  // field-level caveat, not a message that should compete with the field's
  // own contents (`docs/DESIGN.md`).
  hintText: {
    fontSize: 12,
    lineHeight: 16,
  },
});
