import type { FriendInvite } from '@splitcount/shared';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/use-auth';
import { fetchInvite, rotateInvite } from '@/lib/api/friends';
import { errorFields, logger } from '@/lib/logger';

type InviteState =
  | { status: 'loading' }
  | { status: 'ready'; invite: FriendInvite }
  | { status: 'error' };

/** "17 September 2026" — the expiry needs to be readable, not precise. */
function formatExpiry(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function InviteScreen() {
  const { authorizedFetch } = useAuth();
  const [state, setState] = useState<InviteState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;

    fetchInvite(authorizedFetch)
      .then((invite) => {
        if (active) {
          setState({ status: 'ready', invite });
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        logger.warn('friends.invite.load.failed', errorFields(error));
        setState({ status: 'error' });
      });

    return () => {
      active = false;
    };
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
    } catch (error) {
      // The link stays on screen and selectable, so this is not fatal.
      logger.warn('friends.invite.copy.failed', errorFields(error));
    }
  }

  async function handleShare() {
    if (!invite) {
      return;
    }
    try {
      await Share.share({
        message: `Join me on SplitCount: ${invite.url}`,
        url: invite.url,
      });
    } catch (error) {
      logger.warn('friends.invite.share.failed', errorFields(error));
    }
  }

  async function handleRotate() {
    setRotating(true);
    setCopied(false);
    try {
      setState({ status: 'ready', invite: await rotateInvite(authorizedFetch) });
    } catch (error) {
      logger.warn('friends.invite.rotate.failed', errorFields(error));
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
        <ActivityIndicator testID="invite-loading" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.intro}>
        <ThemedText type="subtitle">Invite a friend</ThemedText>
        <ThemedText themeColor="textSecondary">
          Send this link. Whoever opens it and signs in is added to your friends.
        </ThemedText>
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.linkBox}>
        <ThemedText selectable style={styles.link}>
          {invite.url}
        </ThemedText>
      </ThemedView>

      <ThemedText type="small" themeColor="textSecondary">
        {`This link works until ${formatExpiry(invite.expiresAt)}.`}
      </ThemedText>

      <ThemedView style={styles.actions}>
        <Button label="Share" onPress={() => void handleShare()} />
        <Button
          label={copied ? 'Copied' : 'Copy link'}
          variant="secondary"
          onPress={() => void handleCopy()}
        />
      </ThemedView>

      <Button
        label="Generate a new link"
        variant="secondary"
        busy={rotating}
        onPress={() => void handleRotate()}
        style={styles.rotate}
      />
      <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
        Generating a new link stops the previous one from working.
      </ThemedText>
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
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  link: {
    fontSize: 14,
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  rotate: {
    marginTop: 'auto',
  },
});
