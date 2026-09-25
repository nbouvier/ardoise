import type { Invite } from '@splitcount/shared';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, View } from 'react-native';

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
  | { status: 'loading' }
  | { status: 'ready'; invite: Invite }
  | { status: 'error' };

/** How long the "Copied" tooltip stays up. */
const COPIED_TOOLTIP_MS = 2000;

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
}: InviteShareScreenProps) {
  const { authorizedFetch } = useAuth();
  const theme = useTheme();
  const [state, setState] = useState<InviteState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmingRotate, setConfirmingRotate] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  async function handleCopy() {
    if (!invite) {
      return;
    }
    try {
      await Clipboard.setStringAsync(invite.url);
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
      <ThemedView style={styles.centered}>
        <ThemedText type="subtitle">Can’t create a link</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centeredText}>
          We couldn’t reach SplitCount. Check your connection and try again.
        </ThemedText>
        <Button label="Try again" variant="secondary" onPress={retry} />
      </ThemedView>
    );
  }

  if (!invite) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator testID="invite-loading" color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.intro}>
        <ThemedText type="subtitle">{title}</ThemedText>
        <ThemedText themeColor="textSecondary">{blurb}</ThemedText>
      </View>

      {/* The link itself is the content here, so it gets the card — with the
          three things to do with it as icons at the end of its own title line. */}
      <Card tone="brand" style={styles.linkBox}>
        <View style={styles.linkHeader}>
          <ThemedText type="overline" themeColor="onPrimarySoft" style={styles.linkTitle}>
            Your invitation link
          </ThemedText>
          <IconButton
            icon="share"
            accessibilityLabel="Share"
            color={theme.onPrimarySoft}
            onPress={() => void handleShare()}
          />
          <IconButton
            icon={copied ? 'check' : 'copy'}
            accessibilityLabel={copied ? 'Copied' : 'Copy link'}
            color={theme.onPrimarySoft}
            onPress={() => void handleCopy()}
          />
          <IconButton
            icon="refresh"
            accessibilityLabel="Generate a new link"
            color={theme.onPrimarySoft}
            disabled={rotating}
            // The old link stops working the moment a new one exists — never a stray tap.
            onPress={() => setConfirmingRotate(true)}
          />
        </View>
        {/* Tapping the link itself copies it, the quickest way there is. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Invitation link, tap to copy"
          onPress={() => void handleCopy()}
          style={({ pressed }) => pressed && styles.pressed}>
          <ThemedText style={styles.link}>{invite.url}</ThemedText>
        </Pressable>
      </Card>

      {copied ? (
        <View pointerEvents="none" style={[styles.tooltip, { backgroundColor: theme.text }]}>
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            Copied
          </ThemedText>
        </View>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary">
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
  pressed: {
    opacity: 0.6,
  },
  // A bubble that floats over the page briefly, then goes.
  tooltip: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: Spacing.five,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
  },
});
