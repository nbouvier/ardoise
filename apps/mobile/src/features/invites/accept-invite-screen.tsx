import type { AcceptInviteResult, ClaimablePlaceholder, InvitePreview } from '@ardoise/shared';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useDialog } from '@/components/use-dialog';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/use-auth';
import { centsToText } from '@/features/transactions/amount-input';
import { useTheme } from '@/hooks/use-theme';
import { getApiBaseUrl } from '@/lib/api/config';
import { ApiError } from '@/lib/api/errors';
import { claimPlaceholder, fetchPlaceholders } from '@/lib/api/groups';
import { acceptInvite, previewInvite } from '@/lib/api/invites';
import { errorFields, logger } from '@/lib/logger';
import { useInvalidation } from '@/lib/query/use-invalidation';

/**
 * Why an invitation cannot be used. `dead` covers unknown, expired, revoked and
 * "the group is gone" on purpose: the recipient's next step is identical, and
 * not distinguishing them avoids confirming that a code ever existed.
 */
type Problem = 'dead' | 'self' | 'offline';

type ScreenState =
  | { status: 'loading' }
  | { status: 'preview'; preview: InvitePreview }
  | { status: 'claim'; result: AcceptInviteResult & { kind: 'group' }; placeholders: ClaimablePlaceholder[] }
  | { status: 'accepted'; result: AcceptInviteResult; claimedName?: string }
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
    title: 'Can’t reach Ardoise',
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

function acceptedCopy(result: AcceptInviteResult, claimedName?: string): string {
  if (result.kind === 'group') {
    if (claimedName) {
      return `You joined “${result.group.name}” as ${claimedName}`;
    }
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

/** What claiming a placeholder takes over, said before it happens. */
function claimMessage(placeholder: ClaimablePlaceholder, groupName: string): string {
  const { name, transactionCount, balanceCents } = placeholder;
  const count = transactionCount === 1 ? '1 transaction' : `${transactionCount} transactions`;
  const standing =
    balanceCents > 0
      ? ` In “${groupName}”, ${name} is owed ${centsToText(balanceCents)}.`
      : balanceCents < 0
        ? ` In “${groupName}”, ${name} owes ${centsToText(-balanceCents)}.`
        : '';
  return `${name}’s ${count} become yours.${standing} This can’t be undone.`;
}

/**
 * The confirmation an invitation leads to, whatever it is for. One screen
 * because the flow is identical: see who is inviting, decide, land somewhere.
 * Joining a group that has placeholder members first asks whether the person
 * is one of them (`docs/specs/placeholder-members.md`).
 */
export function AcceptInviteScreen({ code, onClose, onAccepted }: AcceptInviteScreenProps) {
  const { authorizedFetch } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [state, setState] = useState<ScreenState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const { dialog, confirm, inform } = useDialog();
  const invalidation = useInvalidation();

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
      onAccepted?.(result);
      if (result.kind === 'group' && !result.alreadyMember) {
        const placeholders = await claimablePlaceholders(result.group.id);
        if (placeholders.length > 0) {
          setState({ status: 'claim', result, placeholders });
          return;
        }
      }
      setState({ status: 'accepted', result });
    } catch (error) {
      logger.warn('invites.accept.failed', errorFields(error));
      setState({ status: 'problem', problem: problemFor(error) });
    } finally {
      setAccepting(false);
    }
  }

  /**
   * The placeholders the new member could be, or none — not finding out
   * only skips the question: "This is me" stays on the group's Manage tab.
   */
  async function claimablePlaceholders(groupId: string): Promise<ClaimablePlaceholder[]> {
    try {
      const { placeholders, viewerCanClaim } = await fetchPlaceholders(authorizedFetch, groupId);
      return viewerCanClaim ? placeholders : [];
    } catch (error) {
      logger.warn('groups.placeholders.load.failed', errorFields(error));
      return [];
    }
  }

  function askToClaim(
    result: AcceptInviteResult & { kind: 'group' },
    placeholders: ClaimablePlaceholder[],
    placeholder: ClaimablePlaceholder,
  ) {
    confirm({
      title: `You are ${placeholder.name}?`,
      message: claimMessage(placeholder, result.group.name),
      confirmLabel: 'That’s me',
      onConfirm: () => {
        setClaiming(true);
        claimPlaceholder(authorizedFetch, result.group.id, placeholder.id)
          .then(() => {
            void invalidation.transactionsChanged();
            setState({ status: 'accepted', result, claimedName: placeholder.name });
          })
          .catch((error: unknown) => {
            logger.warn('groups.placeholder.claim.failed', errorFields(error));
            if (error instanceof ApiError && error.code === 'placeholder_not_found') {
              // Someone else got there first: offer what is left.
              const rest = placeholders.filter((other) => other.id !== placeholder.id);
              setState(
                rest.length > 0
                  ? { status: 'claim', result, placeholders: rest }
                  : { status: 'accepted', result },
              );
              inform(
                `${placeholder.name} isn’t in the group any more`,
                'Someone may have claimed or removed them.',
              );
            } else {
              inform('That didn’t work', 'Check your connection and try again.');
            }
          })
          .finally(() => setClaiming(false));
      },
    });
  }

  function openGroup(groupId: string) {
    onClose();
    router.push({ pathname: '/groups/[id]', params: { id: groupId } });
  }

  if (state.status === 'loading') {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator testID="accept-invite-loading" color={theme.primary} />
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
        <View style={styles.actions}>
          {state.problem === 'offline' ? <Button label="Try again" onPress={retry} /> : null}
          <Button label="Close" variant="ghost" onPress={onClose} />
        </View>
      </ThemedView>
    );
  }

  if (state.status === 'claim') {
    const { result, placeholders } = state;
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="subtitle" style={styles.centered}>
          Is one of these you?
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centered}>
          {`They were added to “${result.group.name}” by name before joining. If one is you, what was recorded for them becomes yours.`}
        </ThemedText>
        <ScrollView style={styles.claimList} contentContainerStyle={styles.claimListContent}>
          {placeholders.map((placeholder) => (
            <Pressable
              key={placeholder.id}
              accessibilityRole="button"
              accessibilityLabel={`I’m ${placeholder.name}`}
              disabled={claiming}
              onPress={() => askToClaim(result, placeholders, placeholder)}
              style={({ pressed }) => [
                styles.claimRow,
                {
                  backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                },
              ]}>
              <Avatar name={placeholder.name} picture={null} size={36} seed={placeholder.id} />
              <View style={styles.claimText}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {placeholder.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {placeholder.transactionCount === 1
                    ? '1 transaction'
                    : `${placeholder.transactionCount} transactions`}
                </ThemedText>
              </View>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.actions}>
          <Button
            label="I’m not on the list"
            variant="ghost"
            disabled={claiming}
            onPress={() => setState({ status: 'accepted', result })}
          />
        </View>
        {dialog}
      </ThemedView>
    );
  }

  if (state.status === 'accepted') {
    const { result, claimedName } = state;
    return (
      <ThemedView style={styles.container}>
        {result.kind === 'friend' ? (
          <Avatar
            name={result.friend.name}
            picture={result.friend.picture}
            size={88}
            seed={result.friend.id}
          />
        ) : null}
        <ThemedText type="subtitle" style={styles.centered}>
          {acceptedCopy(result, claimedName)}
        </ThemedText>
        <View style={styles.actions}>
          {result.kind === 'group' ? (
            <Button label="Open group" onPress={() => openGroup(result.group.id)} />
          ) : null}
          <Button
            label="Done"
            variant={result.kind === 'group' ? 'ghost' : 'primary'}
            onPress={onClose}
          />
        </View>
        {dialog}
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
        seed={state.preview.inviter.name}
      />
      <ThemedText type="subtitle" style={styles.centered}>
        {title}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.centered}>
        {body}
      </ThemedText>
      <View style={styles.actions}>
        <Button
          label={state.preview.kind === 'group' ? 'Join group' : 'Accept'}
          busy={accepting}
          onPress={() => void handleAccept()}
        />
        <Button label="Not now" variant="ghost" disabled={accepting} onPress={onClose} />
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
  claimList: {
    alignSelf: 'stretch',
    flexGrow: 0,
  },
  claimListContent: {
    gap: Spacing.two,
  },
  claimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
  },
  claimText: {
    flex: 1,
  },
});
