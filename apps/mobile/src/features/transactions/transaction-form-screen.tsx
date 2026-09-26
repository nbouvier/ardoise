import {
  DEFAULT_TRANSACTION_CATEGORY,
  categoryDefinition,
  type CreateTransactionRequest,
  type GroupDetail,
  type SplitInput,
  type Transaction,
  type TransactionCategory,
  type TransactionKind,
} from '@splitcount/shared';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Pill } from '@/components/pill';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useDialog } from '@/components/use-dialog';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { createTransaction, deleteTransaction, updateTransaction } from '@/lib/api/transactions';
import { errorFields, logger } from '@/lib/logger';

import { AmountInput } from './amount-input';
import { CategoryPicker } from './category-picker';
import { DatePickerField } from './date-picker-field';
import { MemberSelect } from './member-select';
import { SplitEditor } from './split-editor';
import { splitFrom } from './transaction-request';

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
  const members = group.members;
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
  const [payerId, setPayerId] = useState(initial?.payer.id ?? start?.payerId ?? viewerId);
  const [split, setSplit] = useState<SplitInput>(
    initial && initial.kind !== 'transfer'
      ? splitFrom(initial)
      : defaultSplit(members.map((m) => m.id)),
  );
  const [toUserId, setToUserId] = useState<string | null>(
    initial?.kind === 'transfer'
      ? (initial.participants[0]?.user.id ?? null)
      : (start?.toUserId ?? null),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const { dialog, confirm } = useDialog();
  const selectedCategory = categoryDefinition(category);

  const amountValid = amountCents !== null && amountCents > 0;
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(occurredOn) && !Number.isNaN(Date.parse(occurredOn));
  const splitValid =
    kind === 'transfer'
      ? toUserId !== null && toUserId !== payerId
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
      return { kind: 'transfer', ...common, toUserId: toUserId! };
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
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="subtitle">{initial ? 'Edit transaction' : 'Add a transaction'}</ThemedText>

      <View style={styles.kindRow}>
        {(['expense', 'income', 'transfer'] as const).map((option) => (
          <Pill
            key={option}
            label={kindLabels[option]}
            selected={kind === option}
            onPress={() => setKind(option)}
            style={styles.kindPill}
          />
        ))}
      </View>

      {/* What the transaction is: its category, name, amount and date. */}
      <Card style={styles.section}>
        <View style={styles.titleRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Category: ${selectedCategory?.label ?? 'Other'}`}
            onPress={() => setCategoryPickerOpen(true)}
            style={[styles.categoryBadge, { backgroundColor: theme.primarySoft }]}>
            <ThemedText style={styles.categoryEmoji}>{selectedCategory?.emoji ?? '🧾'}</ThemedText>
          </Pressable>
          <TextField
            accessibilityLabel="Title"
            placeholder="Groceries, taxi, rent…"
            value={title}
            onChangeText={setTitle}
            maxLength={80}
            style={styles.titleInput}
          />
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

        <TextField
          accessibilityLabel="Comment"
          placeholder="Comment (optional)"
          value={comment}
          onChangeText={setComment}
          maxLength={500}
          multiline
        />
      </Card>

      {/* Who it involves: the payer, then either a recipient or a split. */}
      <Card style={styles.section}>
        <ThemedText type="overline" themeColor="textSecondary">
          {kind === 'income' ? 'Who received it' : 'Who paid'}
        </ThemedText>
        <MemberSelect members={members} selectedId={payerId} onSelect={setPayerId} />

        {kind === 'transfer' ? (
          <>
            <ThemedText type="overline" themeColor="textSecondary">
              To
            </ThemedText>
            <MemberSelect
              members={members}
              selectedId={toUserId}
              onSelect={setToUserId}
              excludeId={payerId}
            />
          </>
        ) : (
          <>
            <ThemedText type="overline" themeColor="textSecondary">
              Who it concerns
            </ThemedText>
            <SplitEditor
              members={members}
              amountCents={amountCents ?? 0}
              value={split}
              onChange={setSplit}
            />
          </>
        )}
      </Card>

      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        <Button label="Save" busy={busy} disabled={!canSubmit} onPress={() => void handleSave()} />
        <Button label="Cancel" variant="ghost" disabled={busy} onPress={onCancel} />
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

      <Modal
        visible={categoryPickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCategoryPickerOpen(false)}>
        <ThemedView style={styles.sheet}>
          <SafeAreaView style={styles.sheet}>
            <View style={styles.sheetContent}>
              <ThemedText type="subtitle">Category</ThemedText>
              <CategoryPicker
                value={category}
                onChange={(next) => {
                  setCategory(next);
                  setCategoryPickerOpen(false);
                }}
              />
              <Button label="Close" variant="ghost" onPress={() => setCategoryPickerOpen(false)} />
            </View>
          </SafeAreaView>
        </ThemedView>
      </Modal>

      {dialog}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
    padding: Spacing.four,
  },
  kindRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  kindPill: {
    flex: 1,
    alignItems: 'center',
  },
  section: {
    gap: Spacing.three,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  titleInput: {
    flex: 1,
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
  sheet: {
    flex: 1,
  },
  sheetContent: {
    flex: 1,
    gap: Spacing.three,
    padding: Spacing.four,
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
