import type { AcceptInviteResult, InvitePreview } from '@splitcount/shared';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/use-auth';
import { getApiBaseUrl } from '@/lib/api/config';
import { ApiError } from '@/lib/api/errors';
import { acceptInvite, previewInvite } from '@/lib/api/invites';
import { errorFields, logger } from '@/lib/logger';

/**
 * Why an invitation cannot be used. `dead` covers unknown, expired, revoked and
 * "the group is gone" on purpose: the recipient's next step is identical, and
 * not distinguishing them avoids confirming that a code ever existed.
 */
type Problem = 'dead' | 'self' | 'offline';

type ScreenState =
  | { status: 'loading' }
  | { status: 'preview'; preview: InvitePreview }
  | { status: 'accepted'; result: AcceptInviteResult }
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

/** The headline and supporting line of the confirmation, per kind. */
function previewCopy(preview: InvitePreview): { title: string; body: string } {
  if (preview.kind === 'group') {
    const others = preview.group.memberCount;
    return {
      title: `${preview.inviter.name} invited you to “${preview.group.name}”`,
      body:
        others === 1
          ? 'You’ll be able to share expenses with everyone in this group.'
          : `${others} people are already in this group.`,
    };
  }
  return {
    title: `${preview.inviter.name} wants to add you as a friend`,
    body: 'You’ll both be able to share expenses together.',
  };
}

function acceptedCopy(result: AcceptInviteResult): string {
  if (result.kind === 'group') {
    return result.alreadyMember
      ? `You’re already in “${result.group.name}”`
      : `You joined “${result.group.name}”`;
  }
  return result.alreadyFriends
    ? `You were already friends with ${result.friend.name}`
    : `You’re now friends with ${result.friend.name}`;
}

export interface AcceptInviteScreenProps {
  code: string;
  /** Dismiss the invitation, whether it succeeded or not. */
  onClose: () => void;
  /** Called once the invitation took effect, so the right list can reload. */
  onAccepted?: (result: AcceptInviteResult) => void;
}

/**
 * The confirmation an invitation leads to, whatever it is for. One screen
 * because the flow is identical: see who is inviting, decide, land somewhere.
 */
export function AcceptInviteScreen({ code, onClose, onAccepted }: AcceptInviteScreenProps) {
  const { authorizedFetch } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<ScreenState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let active = true;

    previewInvite(getApiBaseUrl(), code)
      .then((preview) => {
        if (active) {
          setState({ status: 'preview', preview });
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        logger.warn('invites.preview.failed', errorFields(error));
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
      const result = await acceptInvite(authorizedFetch, code);
      setState({ status: 'accepted', result });
      onAccepted?.(result);
    } catch (error) {
      logger.warn('invites.accept.failed', errorFields(error));
      setState({ status: 'problem', problem: problemFor(error) });
    } finally {
      setAccepting(false);
    }
  }

  function openGroup(groupId: string) {
    onClose();
    router.push({ pathname: '/groups/[id]', params: { id: groupId } });
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
    const { result } = state;
    return (
      <ThemedView style={styles.container}>
        {result.kind === 'friend' ? (
          <Avatar name={result.friend.name} picture={result.friend.picture} size={88} />
        ) : null}
        <ThemedText type="subtitle" style={styles.centered}>
          {acceptedCopy(result)}
        </ThemedText>
        <ThemedView style={styles.actions}>
          {result.kind === 'group' ? (
            <Button label="Open group" onPress={() => openGroup(result.group.id)} />
          ) : null}
          <Button
            label="Done"
            variant={result.kind === 'group' ? 'secondary' : 'primary'}
            onPress={onClose}
          />
        </ThemedView>
      </ThemedView>
    );
  }

  const { title, body } = previewCopy(state.preview);
  return (
    <ThemedView style={styles.container}>
      <Avatar
        name={state.preview.inviter.name}
        picture={state.preview.inviter.picture}
        size={88}
      />
      <ThemedText type="subtitle" style={styles.centered}>
        {title}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.centered}>
        {body}
      </ThemedText>
      <ThemedView style={styles.actions}>
        <Button
          label={state.preview.kind === 'group' ? 'Join group' : 'Accept'}
          busy={accepting}
          onPress={() => void handleAccept()}
        />
        <Button label="Not now" variant="secondary" disabled={accepting} onPress={onClose} />
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  centered: {
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
});
