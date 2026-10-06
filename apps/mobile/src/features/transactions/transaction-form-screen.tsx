import {
  DEFAULT_TRANSACTION_CATEGORY,
  categoryDefinition,
  type CreateTransactionRequest,
  type GroupDetail,
  type PartyId,
  type SplitInput,
  type Transaction,
  type TransactionCategory,
  type TransactionKind,
} from '@ardoise/shared';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { DropdownMenu } from '@/components/dropdown-menu';
import { SegmentedSwitch } from '@/components/segmented-switch';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useDialog } from '@/components/use-dialog';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { createTransaction, deleteTransaction, updateTransaction } from '@/lib/api/transactions';
import { errorFields, logger } from '@/lib/logger';

import { AmountInput } from './amount-input';
import { CategoryPicker } from './category-picker';
import { DatePickerField } from './date-picker-field';
import { MemberDropdownField, type PartyChoice } from './member-dropdown-field';
import { SplitEditor } from './split-editor';
import { formParties, splitFrom } from './transaction-request';

/**
 * A new transaction's starting values, for a caller that already knows what
 * it should say — today, a suggested reimbursement
 * (`docs/specs/reimbursements.md`). Everything stays editable: a partial
 * reimbursement is recorded by changing the amount before saving. Ignored
 * when `initial` is given, since editing an existing transaction has its own
 * values.
 */
export interface TransactionPrefill {
  kind: TransactionKind;
  title: string;
  amountCents: number;
  payerId: string;
  /** The person reimbursed — only meaningful for a `transfer`. */
  toUserId?: string;
}

export interface TransactionFormScreenProps {
  group: GroupDetail;
  viewerId: string;
  /** Editing this transaction when present; recording a new one otherwise. */
  initial?: Transaction;
  /** Starting values for a *new* transaction. See `TransactionPrefill`. */
  prefill?: TransactionPrefill;
  onSaved: (transaction: Transaction) => void;
  onDeleted: () => void;
  onCancel: () => void;
}

const kindLabels: Record<TransactionKind, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
};

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

function defaultSplit(memberIds: string[]): SplitInput {
  return { mode: 'shares', participants: memberIds.map((userId) => ({ userId, weight: 1 })) };
}

/** Add or edit a transaction — one form for both, pre-filled when editing. */
export function TransactionFormScreen({
  group,
  viewerId,
  initial,
  prefill,
  onSaved,
  onDeleted,
  onCancel,
}: TransactionFormScreenProps) {
  const { authorizedFetch } = useAuth();
  const theme = useTheme();
  // Includes anyone the edited transaction names who has left the group
  // since: hidden, they would still be sent, and the edit refused.
  const members = useMemo(() => formParties(group.members, initial), [group.members, initial]);
  // Editing wins over a pre-fill: an existing transaction's own values are
  // the only sensible starting point for it.
  const start = initial ? undefined : prefill;

  const [kind, setKind] = useState<TransactionKind>(initial?.kind ?? start?.kind ?? 'expense');
  const [title, setTitle] = useState(initial?.title ?? start?.title ?? '');
  const [amountCents, setAmountCents] = useState<number | null>(
    initial?.amountCents ?? start?.amountCents ?? 0,
  );
  const [occurredOn, setOccurredOn] = useState(initial?.occurredOn ?? today());
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [category, setCategory] = useState<TransactionCategory>(
    initial?.category ?? DEFAULT_TRANSACTION_CATEGORY,
  );
  // `null` is Others: only ever the stored payer of a transaction being
  // edited, and a choice only there (`docs/specs/transactions.md`). Written
  // out rather than chained with `??`, which would turn Others into the viewer.
  const [payerId, setPayerId] = useState<PartyId>(
    initial ? (initial.payer?.id ?? null) : (start?.payerId ?? viewerId),
  );
  // Others is offered back in "Who paid" / "To" only where this transaction
  // was stored with it, so picking a member there can be undone.
  const storedOthersPayer = initial !== undefined && initial.payer === null;
  const storedOthersRecipient =
    initial?.kind === 'transfer' && initial.participants[0]?.user === null;
  const [split, setSplit] = useState<SplitInput>(
    initial && initial.kind !== 'transfer'
      ? splitFrom(initial)
      : defaultSplit(members.map((m) => m.id)),
  );
  const [recipient, setRecipient] = useState<PartyChoice>(() => {
    if (initial?.kind === 'transfer') {
      const stored = initial.participants[0];
      return stored ? { status: 'picked', id: stored.user?.id ?? null } : { status: 'unset' };
    }
    return start?.toUserId ? { status: 'picked', id: start.toUserId } : { status: 'unset' };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const { dialog, confirm } = useDialog();
  const selectedCategory = categoryDefinition(category);

  const amountValid = amountCents !== null && amountCents > 0;
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(occurredOn) && !Number.isNaN(Date.parse(occurredOn));
  const splitValid =
    kind === 'transfer'
      ? recipient.status === 'picked' && recipient.id !== payerId
      : split.participants.length > 0 &&
        (split.mode === 'shares' ||
          split.participants.reduce((sum, p) => sum + p.amount, 0) === amountCents);
  const canSubmit = title.trim().length > 0 && amountValid && dateValid && splitValid && !busy;

  function buildRequest(): CreateTransactionRequest {
    const common = {
      title: title.trim(),
      amount: amountCents ?? 0,
      occurredOn,
      comment: comment.trim() === '' ? null : comment.trim(),
      category,
      payerId,
    };
    if (kind === 'transfer') {
      // Unreachable: `canSubmit` needs a recipient. Failing loudly beats
      // sending Others for a recipient nobody picked.
      if (recipient.status !== 'picked') {
        throw new Error('A transfer needs a recipient');
      }
      return { kind: 'transfer', ...common, toUserId: recipient.id };
    }
    return { kind, ...common, split };
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const request = buildRequest();
      const saved = initial
        ? await updateTransaction(authorizedFetch, group.id, initial.id, request)
        : await createTransaction(authorizedFetch, group.id, request);
      onSaved(saved);
    } catch (cause: unknown) {
      logger.warn(
        initial ? 'transactions.update.failed' : 'transactions.create.failed',
        errorFields(cause),
      );
      setError('We couldn’t save this transaction. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!initial) {
      return;
    }
    confirm({
      title: 'Delete transaction',
      message: `Delete “${initial.title}” permanently?`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => {
        setBusy(true);
        deleteTransaction(authorizedFetch, group.id, initial.id)
          .then(onDeleted)
          .catch((cause: unknown) => {
            logger.warn('transactions.delete.failed', errorFields(cause));
            setError('We couldn’t delete this transaction. Check your connection and try again.');
            setBusy(false);
          });
      },
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <SegmentedSwitch
        options={[
          { key: 'expense', label: kindLabels.expense },
          { key: 'income', label: kindLabels.income },
          { key: 'transfer', label: kindLabels.transfer },
        ]}
        value={kind}
        onChange={setKind}
      />

      {/* What the transaction is: its name, category, amount and date. */}
      <View style={styles.section}>
        <View style={styles.titleRow}>
          <View style={styles.titleField}>
            <ThemedText type="overline" themeColor="textSecondary">
              Title
            </ThemedText>
            <TextField
              accessibilityLabel="Title"
              placeholder="Groceries, taxi, rent…"
              value={title}
              onChangeText={setTitle}
              maxLength={80}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Category: ${selectedCategory?.label ?? 'Other'}`}
            onPress={() => setCategoryPickerOpen(true)}
            style={({ pressed }) => [
              styles.categoryBadge,
              { backgroundColor: pressed ? theme.backgroundSelected : theme.primarySoft },
            ]}>
            <ThemedText style={styles.categoryEmoji}>{selectedCategory?.emoji ?? '🧾'}</ThemedText>
          </Pressable>
        </View>

        <View style={styles.fieldRow}>
          <View style={styles.amountField}>
            <ThemedText type="overline" themeColor="textSecondary">
              Amount
            </ThemedText>
            <AmountInput defaultValueCents={amountCents ?? 0} onChangeCents={setAmountCents} />
          </View>
          <View style={styles.dateField}>
            <ThemedText type="overline" themeColor="textSecondary">
              Date
            </ThemedText>
            <DatePickerField value={occurredOn} onChange={setOccurredOn} />
          </View>
        </View>

        <View style={styles.payerField}>
          <ThemedText type="overline" themeColor="textSecondary">
            {kind === 'income' ? 'Who received it' : 'Who paid'}
          </ThemedText>
          <MemberDropdownField
            accessibilityLabel={kind === 'income' ? 'Who received it' : 'Who paid'}
            members={members}
            selected={{ status: 'picked', id: payerId }}
            onSelect={setPayerId}
            viewerId={viewerId}
            offerOthers={storedOthersPayer}
          />
        </View>

        <View style={styles.commentField}>
          <ThemedText type="overline" themeColor="textSecondary">
            Comment (optional)
          </ThemedText>
          <TextField
            accessibilityLabel="Comment"
            placeholder="Pizza night, don’t forget the tip"
            value={comment}
            onChangeText={setComment}
            maxLength={500}
            multiline
            style={styles.comment}
          />
        </View>
      </View>

      {/* Who it involves: either a recipient (transfer) or a split. */}
      <View style={styles.section}>
        {kind === 'transfer' ? (
          <View style={styles.payerField}>
            <ThemedText type="overline" themeColor="textSecondary">
              To
            </ThemedText>
            <MemberDropdownField
              accessibilityLabel="To"
              members={members}
              selected={recipient}
              onSelect={(id) => setRecipient({ status: 'picked', id })}
              viewerId={viewerId}
              excludeId={payerId}
              offerOthers={storedOthersRecipient}
            />
          </View>
        ) : (
          <SplitEditor
            members={members}
            amountCents={amountCents ?? 0}
            value={split}
            onChange={setSplit}
            viewerId={viewerId}
          />
        )}
      </View>

      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        <Button label="Cancel" variant="ghost" disabled={busy} onPress={onCancel} />
        <Button label="Save" busy={busy} disabled={!canSubmit} onPress={() => void handleSave()} />
        {initial ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={confirmDelete}
            style={({ pressed }) => [styles.delete, pressed && styles.pressed]}>
            <ThemedText type="smallBold" themeColor="danger">
              Delete this transaction
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      {/* A dropdown over the form, the same popup language as a group's own
          "⋮" menu — not a full page sheet of its own. */}
      <DropdownMenu visible={categoryPickerOpen} onClose={() => setCategoryPickerOpen(false)}>
        <CategoryPicker
          value={category}
          onChange={(next) => {
            setCategory(next);
            setCategoryPickerOpen(false);
          }}
        />
      </DropdownMenu>

      {dialog}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // No horizontal padding of its own — this screen only ever renders as the
  // Transactions tab's own content (`group-screen.tsx`), inside a page that
  // already pads its sides; adding more here doubled up on the edges.
  container: {
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  section: {
    gap: Spacing.three,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  titleField: {
    flex: 1,
    gap: Spacing.one,
  },
  categoryBadge: {
    width: 52,
    height: 52,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEmoji: {
    fontSize: 20,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  amountField: {
    flex: 1,
    gap: Spacing.one,
  },
  dateField: {
    flex: 1,
    gap: Spacing.one,
  },
  payerField: {
    gap: Spacing.one,
  },
  commentField: {
    gap: Spacing.one,
  },
  // A paragraph's worth of room, not the generic multiline field's shorter
  // default — a comment here still fits under Amount/Date/Who paid, but reads
  // as more than a single aside line.
  comment: {
    minHeight: 88,
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  delete: {
    alignSelf: 'center',
    paddingVertical: Spacing.three,
  },
  pressed: {
    opacity: 0.6,
  },
});
