import type { FriendSummary } from '@splitcount/shared';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/use-auth';
import { getApiBaseUrl } from '@/lib/api/config';
import { ApiError } from '@/lib/api/errors';
import { acceptInvite, previewInvite } from '@/lib/api/friends';
import { errorFields, logger } from '@/lib/logger';

/**
 * Why an invitation cannot be used. `dead` covers unknown, expired and revoked
 * codes on purpose: the recipient's next step is identical, and not
 * distinguishing them avoids confirming that a code ever existed.
 */
type Problem = 'dead' | 'self' | 'offline';

type ScreenState =
  | { status: 'loading' }
  | { status: 'preview'; inviter: FriendSummary }
  | { status: 'accepted'; friend: FriendSummary; alreadyFriends: boolean }
  | { status: 'problem'; problem: Problem };

const PROBLEM_COPY: Record<Problem, { title: string; body: string }> = {
  dead: {
    title: 'This invitation is no longer valid',
    body: 'It may have expired or been replaced. Ask for a new link.',
  },
  self: {
    title: 'This is your own link',
    body: 'Send it to someone else — you can’t add yourself as a friend.',
  },
  offline: {
    title: 'Can’t reach SplitCount',
    body: 'Check your connection and try again.',
  },
};

function problemFor(error: unknown): Problem {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return 'self';
    }
    if (error.status === 404 || error.status === 410) {
      return 'dead';
    }
  }
  return 'offline';
}

export interface AcceptInviteScreenProps {
  code: string;
  /** Dismiss the invitation, whether it succeeded or not. */
  onClose: () => void;
  /** Called after a friendship is created, so the friend list can reload. */
  onAccepted?: () => void;
}

export function AcceptInviteScreen({ code, onClose, onAccepted }: AcceptInviteScreenProps) {
  const { authorizedFetch } = useAuth();
  const [state, setState] = useState<ScreenState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let active = true;

    previewInvite(getApiBaseUrl(), code)
      .then(({ inviter }) => {
        if (active) {
          setState({ status: 'preview', inviter });
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        logger.warn('friends.invite.preview.failed', errorFields(error));
        setState({ status: 'problem', problem: problemFor(error) });
      });

    return () => {
      active = false;
    };
  }, [code, reloadToken]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setReloadToken((token) => token + 1);
  }, []);

  async function handleAccept() {
    setAccepting(true);
    try {
      const { friend, alreadyFriends } = await acceptInvite(authorizedFetch, code);
      setState({ status: 'accepted', friend, alreadyFriends });
      onAccepted?.();
    } catch (error) {
      logger.warn('friends.invite.accept.failed', errorFields(error));
      setState({ status: 'problem', problem: problemFor(error) });
    } finally {
      setAccepting(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator testID="accept-invite-loading" />
      </ThemedView>
    );
  }

  if (state.status === 'problem') {
    const { title, body } = PROBLEM_COPY[state.problem];
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="subtitle" style={styles.centered}>
          {title}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centered}>
          {body}
        </ThemedText>
        <ThemedView style={styles.actions}>
          {state.problem === 'offline' ? (
            <Button label="Try again" onPress={retry} />
          ) : null}
          <Button label="Close" variant="secondary" onPress={onClose} />
        </ThemedView>
      </ThemedView>
    );
  }

  if (state.status === 'accepted') {
    return (
      <ThemedView style={styles.container}>
        <Avatar user={state.friend} />
        <ThemedText type="subtitle" style={styles.centered}>
          {state.alreadyFriends
            ? `You were already friends with ${state.friend.name}`
            : `You’re now friends with ${state.friend.name}`}
        </ThemedText>
        <ThemedView style={styles.actions}>
          <Button label="Done" onPress={onClose} />
        </ThemedView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Avatar user={state.inviter} />
      <ThemedText type="subtitle" style={styles.centered}>
        {`${state.inviter.name} wants to add you as a friend`}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.centered}>
        You’ll both be able to share expenses together.
      </ThemedText>
      <ThemedView style={styles.actions}>
        <Button label="Accept" busy={accepting} onPress={() => void handleAccept()} />
        <Button label="Not now" variant="secondary" disabled={accepting} onPress={onClose} />
      </ThemedView>
    </ThemedView>
  );
}

function Avatar({ user }: { user: FriendSummary }) {
  if (user.picture) {
    return <Image source={{ uri: user.picture }} style={styles.avatar} contentFit="cover" />;
  }
  return (
    <ThemedView type="backgroundElement" style={[styles.avatar, styles.avatarFallback]}>
      <ThemedText type="subtitle">{user.name.charAt(0).toUpperCase()}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  centered: {
    textAlign: 'center',
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: Spacing.two,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
});
