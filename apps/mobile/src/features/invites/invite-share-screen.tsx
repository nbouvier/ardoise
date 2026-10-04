import type { Invite } from '@ardoise/shared';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { IconButton } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/use-auth';
import { useTheme } from '@/hooks/use-theme';
import type { AuthorizedFetch } from '@/lib/api/client';
import { errorFields, logger } from '@/lib/logger';

type InviteState =
  { status: 'loading' } | { status: 'ready'; invite: Invite } | { status: 'error' };

/** How long the "Copied" tooltip stays up. */
const COPIED_TOOLTIP_MS = 2000;

/** The tooltip sits in a box this wide, centred on the tap. */
const TOOLTIP_ANCHOR_WIDTH = 96;

/** "17 September 2026" — the expiry needs to be readable, not precise. */
function formatExpiry(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export interface InviteShareScreenProps {
  title: string;
  /** What accepting this link will do, in the recipient's terms. */
  blurb: string;
  /** The message the OS share sheet is pre-filled with. */
  shareMessage: (url: string) => string;
  load: (fetcher: AuthorizedFetch) => Promise<Invite>;
  rotate: (fetcher: AuthorizedFetch) => Promise<Invite>;
  /**
   * Just the link card and its expiry, sized to its content, for a page that
   * has something else to show above it: no title, blurb or full-height layout.
   */
  embedded?: boolean;
}

/**
 * Shows an invitation link and the ways to send it. Shared between a friend
 * invitation and a group one: the link, its lifetime and the actions are
 * identical — only the wording and which endpoint issues it differ.
 */
export function InviteShareScreen({
  title,
  blurb,
  shareMessage,
  load,
  rotate,
  embedded = false,
}: InviteShareScreenProps) {
  const { authorizedFetch } = useAuth();
  const theme = useTheme();
  const [state, setState] = useState<InviteState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmingRotate, setConfirmingRotate] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<View>(null);
  // Where the tooltip goes: the spot that was tapped, in the root's own coordinates.
  const [tooltipAt, setTooltipAt] = useState<{ x: number; y: number } | null>(null);

  // The "Copied" tooltip is a passing acknowledgement, not a state to keep.
  useEffect(
    () => () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;

    load(authorizedFetch)
      .then((invite) => {
        if (active) {
          setState({ status: 'ready', invite });
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        logger.warn('invites.share.load.failed', errorFields(error));
        setState({ status: 'error' });
      });

    return () => {
      active = false;
    };
    // `load` is a prop: depending on it would reload whenever the caller
    // re-renders with a fresh closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorizedFetch, reloadToken]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setReloadToken((token) => token + 1);
  }, []);

  const invite = state.status === 'ready' ? state.invite : null;

  async function handleCopy(event?: GestureResponderEvent) {
    if (!invite) {
      return;
    }
    // Read before the first await: the event is not kept around after it.
    const pageX = event?.nativeEvent?.pageX;
    const pageY = event?.nativeEvent?.pageY;
    try {
      await Clipboard.setStringAsync(invite.url);
      setTooltipAt(null);
      if (pageX !== undefined && pageY !== undefined) {
        rootRef.current?.measureInWindow?.((x, y) => setTooltipAt({ x: pageX - x, y: pageY - y }));
      }
      setCopied(true);
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_TOOLTIP_MS);
    } catch (error) {
      // The link stays on screen and can still be shared, so this is not fatal.
      logger.warn('invites.share.copy.failed', errorFields(error));
    }
  }

  async function handleShare() {
    if (!invite) {
      return;
    }
    try {
      await Share.share({ message: shareMessage(invite.url), url: invite.url });
    } catch (error) {
      logger.warn('invites.share.share.failed', errorFields(error));
    }
  }

  async function handleRotate() {
    setRotating(true);
    setCopied(false);
    try {
      setState({ status: 'ready', invite: await rotate(authorizedFetch) });
    } catch (error) {
      logger.warn('invites.share.rotate.failed', errorFields(error));
      setState({ status: 'error' });
    } finally {
      setRotating(false);
    }
  }

  if (state.status === 'error') {
    return (
      <ThemedView
        style={
          embedded ? [styles.centeredEmbedded, { backgroundColor: 'transparent' }] : styles.centered
        }>
        <ThemedText type="subtitle">Can’t create a link</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centeredText}>
          We couldn’t reach Ardoise. Check your connection and try again.
        </ThemedText>
        <Button label="Try again" variant="secondary" onPress={retry} />
      </ThemedView>
    );
  }

  if (!invite) {
    return (
      <ThemedView
        style={
          embedded ? [styles.centeredEmbedded, { backgroundColor: 'transparent' }] : styles.centered
        }>
        <ActivityIndicator testID="invite-loading" color={theme.primary} />
      </ThemedView>
    );
  }

  const actions = (color: string) => (
    <>
      <IconButton
        icon="share"
        accessibilityLabel="Share"
        color={color}
        onPress={() => void handleShare()}
      />
      <IconButton
        icon={copied ? 'check' : 'copy'}
        accessibilityLabel={copied ? 'Copied' : 'Copy link'}
        color={color}
        onPress={(event) => void handleCopy(event)}
      />
      <IconButton
        icon="refresh"
        accessibilityLabel="Generate a new link"
        color={color}
        disabled={rotating}
        // The old link stops working the moment a new one exists — never a stray tap.
        onPress={() => setConfirmingRotate(true)}
      />
    </>
  );

  return (
    <View
      ref={rootRef}
      style={
        embedded
          ? styles.containerEmbedded
          : [styles.container, { backgroundColor: theme.background }]
      }>
      {embedded ? null : (
        <View style={styles.intro}>
          <ThemedText type="subtitle">{title}</ThemedText>
          <ThemedText themeColor="textSecondary">{blurb}</ThemedText>
        </View>
      )}

      {/* The three things to do with the link, as icons at the end of a title line:
          the card's own when the page is just this link, the section's when the
          link is one section of a larger page. */}
      {embedded ? (
        <View style={styles.linkHeader}>
          <ThemedText type="overline" themeColor="textSecondary" style={styles.linkTitle}>
            Invitation link
          </ThemedText>
          {actions(theme.primary)}
        </View>
      ) : null}

      <Card tone={embedded ? 'surface' : 'brand'} style={styles.linkBox}>
        {embedded ? null : (
          <View style={styles.linkHeader}>
            <ThemedText type="overline" themeColor="onPrimarySoft" style={styles.linkTitle}>
              Your invitation link
            </ThemedText>
            {actions(theme.onPrimarySoft)}
          </View>
        )}
        {/* Tapping the link itself copies it, the quickest way there is. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Invitation link, tap to copy"
          onPress={(event) => void handleCopy(event)}
          style={({ pressed }) => pressed && styles.pressed}>
          <ThemedText style={styles.link}>{invite.url}</ThemedText>
        </Pressable>
      </Card>

      {copied ? (
        // In the app's own colours, at the spot that was tapped.
        <View
          pointerEvents="none"
          style={[
            styles.tooltipAnchor,
            tooltipAt
              ? { left: tooltipAt.x - TOOLTIP_ANCHOR_WIDTH / 2, top: tooltipAt.y - 48 }
              : styles.tooltipCentred,
          ]}>
          <View style={[styles.tooltip, { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
              Copied
            </ThemedText>
          </View>
        </View>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary" style={styles.expiry}>
        {`This link works until ${formatExpiry(invite.expiresAt)}.`}
      </ThemedText>

      <ConfirmDialog
        visible={confirmingRotate}
        title="Generate a new link?"
        message="Generating a new link stops the previous one from working."
        confirmLabel="Generate"
        onCancel={() => setConfirmingRotate(false)}
        onConfirm={() => {
          setConfirmingRotate(false);
          void handleRotate();
        }}
      />
    </View>
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
  containerEmbedded: {
    gap: Spacing.two,
  },
  centeredEmbedded: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  centeredText: {
    textAlign: 'center',
  },
  intro: {
    gap: Spacing.two,
  },
  linkBox: {
    gap: Spacing.two,
  },
  linkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  linkTitle: {
    flex: 1,
  },
  link: {
    fontSize: 14,
  },
  expiry: {
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.6,
  },
  // A bubble that floats over the page briefly, then goes.
  tooltipAnchor: {
    position: 'absolute',
    width: TOOLTIP_ANCHOR_WIDTH,
    alignItems: 'center',
  },
  // Until the tap's position is known (or where it cannot be): over the link.
  tooltipCentred: {
    alignSelf: 'center',
    top: '30%',
  },
  tooltip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
  },
});
