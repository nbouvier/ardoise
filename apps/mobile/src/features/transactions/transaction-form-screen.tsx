import type {
  CreateTransactionRequest,
  GroupDetail,
  SplitInput,
  Transaction,
  TransactionKind,
} from '@splitcount/shared';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { createTransaction, deleteTransaction, updateTransaction } from '@/lib/api/transactions';
import { errorFields, logger } from '@/lib/logger';

import { AmountInput } from './amount-input';
import { DatePickerField } from './date-picker-field';
import { MemberSelect } from './member-select';
import { SplitEditor } from './split-editor';

export interface TransactionFormScreenProps {
  group: GroupDetail;
  viewerId: string;
  /** Editing this transaction when present; recording a new one otherwise. */
  initial?: Transaction;
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

function splitFrom(transaction: Transaction): SplitInput {
  if (transaction.splitMode === 'shares') {
    return {
      mode: 'shares',
      participants: transaction.participants.map((p) => ({
        userId: p.user.id,
        weight: p.weight ?? 1,
      })),
    };
  }
  return {
    mode: 'amount',
    participants: transaction.participants.map((p) => ({ userId: p.user.id, amount: p.shareCents })),
  };
}

/** Add or edit a transaction — one form for both, pre-filled when editing. */
export function TransactionFormScreen({
  group,
  viewerId,
  initial,
  onSaved,
  onDeleted,
  onCancel,
}: TransactionFormScreenProps) {
  const { authorizedFetch } = useAuth();
  const theme = useTheme();
  const members = group.members;

  const [kind, setKind] = useState<TransactionKind>(initial?.kind ?? 'expense');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [amountCents, setAmountCents] = useState<number | null>(initial?.amountCents ?? 0);
  const [occurredOn, setOccurredOn] = useState(initial?.occurredOn ?? today());
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [payerId, setPayerId] = useState(initial?.payer.id ?? viewerId);
  const [split, setSplit] = useState<SplitInput>(
    initial && initial.kind !== 'transfer'
      ? splitFrom(initial)
      : defaultSplit(members.map((m) => m.id)),
  );
  const [toUserId, setToUserId] = useState<string | null>(
    initial?.kind === 'transfer' ? (initial.participants[0]?.user.id ?? null) : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      logger.warn(initial ? 'transactions.update.failed' : 'transactions.create.failed', errorFields(cause));
      setError('We couldn’t save this transaction. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!initial) {
      return;
    }
    Alert.alert('Delete transaction', `Delete “${initial.title}” permanently?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          deleteTransaction(authorizedFetch, group.id, initial.id)
            .then(onDeleted)
            .catch((cause: unknown) => {
              logger.warn('transactions.delete.failed', errorFields(cause));
              setError('We couldn’t delete this transaction. Check your connection and try again.');
              setBusy(false);
            });
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="subtitle">{initial ? 'Edit transaction' : 'Add a transaction'}</ThemedText>

      <View style={styles.kindRow}>
        {(['expense', 'income', 'transfer'] as const).map((option) => (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: kind === option }}
            onPress={() => setKind(option)}
            style={[
              styles.kindButton,
              { borderColor: theme.text },
              kind === option && { backgroundColor: theme.text },
            ]}>
            <ThemedText type="small" style={kind === option ? { color: theme.background } : undefined}>
              {kindLabels[option]}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <TextInput
        accessibilityLabel="Title"
        placeholder="Groceries, taxi, rent…"
        placeholderTextColor={theme.textSecondary}
        value={title}
        onChangeText={setTitle}
        maxLength={80}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />

      <ThemedView style={styles.fieldRow}>
        <View style={styles.amountField}>
          <ThemedText type="small" themeColor="textSecondary">
            Amount
          </ThemedText>
          <AmountInput defaultValueCents={amountCents ?? 0} onChangeCents={setAmountCents} />
        </View>
        <View style={styles.dateField}>
          <ThemedText type="small" themeColor="textSecondary">
            Date
          </ThemedText>
          <DatePickerField value={occurredOn} onChange={setOccurredOn} />
        </View>
      </ThemedView>

      <TextInput
        accessibilityLabel="Comment"
        placeholder="Comment (optional)"
        placeholderTextColor={theme.textSecondary}
        value={comment}
        onChangeText={setComment}
        maxLength={500}
        multiline
        style={[styles.input, styles.commentInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />

      <ThemedText type="smallBold">
        {kind === 'income' ? 'Who received it' : 'Who paid'}
      </ThemedText>
      <MemberSelect members={members} selectedId={payerId} onSelect={setPayerId} />

      {kind === 'transfer' ? (
        <>
          <ThemedText type="smallBold">To</ThemedText>
          <MemberSelect
            members={members}
            selectedId={toUserId}
            onSelect={setToUserId}
            excludeId={payerId}
          />
        </>
      ) : (
        <>
          <ThemedText type="smallBold">Who it concerns</ThemedText>
          <SplitEditor members={members} amountCents={amountCents ?? 0} value={split} onChange={setSplit} />
        </>
      )}

      {error ? (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}

      <ThemedView style={styles.actions}>
        <Button label="Save" busy={busy} disabled={!canSubmit} onPress={() => void handleSave()} />
        <Button label="Cancel" variant="secondary" disabled={busy} onPress={onCancel} />
        {initial ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={confirmDelete}
            style={({ pressed }) => [styles.delete, pressed && styles.pressed]}>
            <ThemedText type="small" style={styles.deleteLabel}>
              Delete this transaction
            </ThemedText>
          </Pressable>
        ) : null}
      </ThemedView>
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
  kindButton: {
    flex: 1,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  input: {
    height: 52,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  commentInput: {
    height: 80,
    paddingTop: Spacing.two,
    textAlignVertical: 'top',
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
  error: {
    color: '#d64545',
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  delete: {
    alignSelf: 'center',
    paddingVertical: Spacing.three,
  },
  deleteLabel: {
    color: '#d64545',
  },
  pressed: {
    opacity: 0.6,
  },
});
