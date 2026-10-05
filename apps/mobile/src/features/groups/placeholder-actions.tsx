import type { GroupDetail, GroupMember } from '@ardoise/shared';
import { Fragment, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { DropdownMenu } from '@/components/dropdown-menu';
import type { IconName } from '@/components/icon';
import { MenuRow } from '@/components/icon-menu-button';
import { PromptDialog } from '@/components/prompt-dialog';
import { useDialog } from '@/components/use-dialog';
import { useAuth } from '@/features/auth/use-auth';
import { centsToText } from '@/features/transactions/amount-input';
import { transactionsChanged } from '@/features/transactions/transactions-changed';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api/errors';
import {
  claimPlaceholder,
  fetchPlaceholders,
  removeGroupMember,
  renamePlaceholder,
} from '@/lib/api/groups';
import { errorFields, logger } from '@/lib/logger';

import { groupsChanged } from './groups-changed';

export interface PlaceholderActionsOptions {
  /** `null` while the group is still loading: nothing is offered then. */
  group: GroupDetail | null;
  /** The group, or an ancestor, is archived: nothing about its members can change. */
  readOnly: boolean;
  /** The group after a change, or `null` when it has to be read again. */
  onChanged: (group: GroupDetail | null) => void;
}

export interface PlaceholderActions {
  /** Whether a placeholder's row offers anything at all. */
  available: boolean;
  /** Open the actions on one placeholder member. */
  open: (member: GroupMember) => void;
  /** The menu and dialogs; render once in the screen. */
  element: ReactNode;
}

type Action = { key: 'claim' | 'rename' | 'remove'; icon: IconName; label: string };

/** "Alex is owed 12.00 here" — or nothing when Alex is settled. */
function standing(name: string, balanceCents: number): string {
  if (balanceCents > 0) {
    return ` In this group, ${name} is owed ${centsToText(balanceCents)}.`;
  }
  if (balanceCents < 0) {
    return ` In this group, ${name} owes ${centsToText(-balanceCents)}.`;
  }
  return '';
}

/**
 * What can be done to a placeholder member from its row in the Manage tab
 * (`docs/specs/placeholder-members.md`): **This is me** while the viewer has
 * not claimed one in this tree, **Rename**, **Remove**. Each states what it
 * does before doing it; a claim and a removal cannot be undone.
 */
export function usePlaceholderActions({
  group,
  readOnly,
  onChanged,
}: PlaceholderActionsOptions): PlaceholderActions {
  const { authorizedFetch } = useAuth();
  const theme = useTheme();
  const { dialog, confirm, inform } = useDialog();
  const [menuFor, setMenuFor] = useState<GroupMember | null>(null);
  const [renaming, setRenaming] = useState<GroupMember | null>(null);

  const actions: Action[] =
    !group || readOnly
    ? []
    : [
        ...(group.viewerCanClaim
          ? [{ key: 'claim' as const, icon: 'account' as const, label: 'This is me' }]
          : []),
        { key: 'rename', icon: 'pencil', label: 'Rename' },
        { key: 'remove', icon: 'trash', label: 'Remove' },
      ];

  /** A refusal the viewer can act on, said plainly; anything else is a retry. */
  function refused(what: string, member: GroupMember, error: unknown) {
    logger.warn(`groups.placeholder.${what}.failed`, errorFields(error));
    const code = error instanceof ApiError ? error.code : null;
    if (code === 'already_claimed') {
      inform('You’ve already said who you are', 'You can only be one person in a group.');
    } else if (code === 'placeholder_not_found') {
      inform(`${member.name} isn’t here any more`, 'Someone may have claimed or removed them.');
      onChanged(null);
    } else if (code === 'placeholder_name_taken') {
      inform('That name is taken', 'Someone in this group already has it.');
    } else {
      inform('That didn’t work', 'Check your connection and try again.');
    }
  }

  async function askToClaim(group: GroupDetail, member: GroupMember) {
    let message = `${member.name}’s transactions become yours.`;
    try {
      const { placeholders } = await fetchPlaceholders(authorizedFetch, group.id);
      const found = placeholders.find((placeholder) => placeholder.id === member.id);
      if (found) {
        const count =
          found.transactionCount === 1 ? '1 transaction' : `${found.transactionCount} transactions`;
        message = `${member.name}’s ${count} become yours.${standing(member.name, found.balanceCents)}`;
      }
    } catch (error) {
      // The confirmation still says what happens, without the figures.
      logger.warn('groups.placeholders.load.failed', errorFields(error));
    }
    confirm({
      title: `You are ${member.name}?`,
      message: `${message} This can’t be undone.`,
      confirmLabel: 'That’s me',
      onConfirm: () => {
        claimPlaceholder(authorizedFetch, group.id, member.id)
          .then((updated) => {
            groupsChanged.notify();
            transactionsChanged.notify();
            onChanged(updated);
          })
          .catch((error: unknown) => refused('claim', member, error));
      },
    });
  }

  function askToRemove(group: GroupDetail, member: GroupMember) {
    const fromRoot = group.parentId === null;
    confirm({
      title: `Remove ${member.name}?`,
      message: fromRoot
        ? `${member.name} leaves this group and every group inside it. Their part in every transaction becomes “Others”: what they owe or are owed is lost. This can’t be undone.`
        : `${member.name} leaves this group and the groups inside it, but stays in the groups above. Transactions here keep their name.`,
      confirmLabel: 'Remove',
      destructive: true,
      onConfirm: () => {
        removeGroupMember(authorizedFetch, group.id, member.id)
          .then(() => {
            groupsChanged.notify();
            if (fromRoot) {
              transactionsChanged.notify();
            }
            onChanged(null);
          })
          .catch((error: unknown) => refused('remove', member, error));
      },
    });
  }

  function rename(group: GroupDetail, member: GroupMember, name: string) {
    setRenaming(null);
    if (name === member.name) {
      return;
    }
    renamePlaceholder(authorizedFetch, group.id, member.id, name)
      .then((updated) => {
        groupsChanged.notify();
        transactionsChanged.notify();
        onChanged(updated);
      })
      .catch((error: unknown) => refused('rename', member, error));
  }

  function choose(action: Action['key'], member: GroupMember) {
    setMenuFor(null);
    if (!group) {
      return;
    }
    if (action === 'claim') {
      void askToClaim(group, member);
    } else if (action === 'rename') {
      setRenaming(member);
    } else {
      askToRemove(group, member);
    }
  }

  const element = (
    <>
      <DropdownMenu visible={menuFor !== null} onClose={() => setMenuFor(null)}>
        {actions.map(({ key, icon, label }, index) => (
          <Fragment key={key}>
            {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.border }]} /> : null}
            <MenuRow
              icon={icon}
              label={label}
              destructive={key === 'remove'}
              onPress={() => menuFor && choose(key, menuFor)}
            />
          </Fragment>
        ))}
      </DropdownMenu>
      {group && renaming ? (
        <PromptDialog
          key={renaming.id}
          visible
          title={`Rename ${renaming.name}`}
          initialValue={renaming.name}
          fieldLabel="Name"
          confirmLabel="Save"
          maxLength={60}
          onConfirm={(name) => rename(group, renaming, name)}
          onCancel={() => setRenaming(null)}
        />
      ) : null}
      {dialog}
    </>
  );

  return { available: actions.length > 0, open: setMenuFor, element };
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
  },
});
