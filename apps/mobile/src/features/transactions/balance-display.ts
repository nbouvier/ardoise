import type { ThemeColor } from '@/constants/theme';

import { centsToText } from './amount-input';

/**
 * How a net balance should read, so that a figure never depends on the viewer
 * spotting a minus sign: in their favour, against them, or neither.
 */
export function balanceTone(amountCents: number): ThemeColor {
  if (amountCents > 0) {
    return 'credit';
  }
  if (amountCents < 0) {
    return 'debit';
  }
  return 'textSecondary';
}

/**
 * Where the viewer stands with one person, in words — positive means that
 * person owes the viewer. Used wherever a balance names a counterparty; a
 * balance against a *group* is worded at its own call site, since "the group
 * owes you" and "Ada owes you" are not the same sentence.
 */
export function balanceWithPerson(amountCents: number): string {
  if (amountCents > 0) {
    return `owes you ${centsToText(amountCents)}`;
  }
  if (amountCents < 0) {
    return `you owe ${centsToText(-amountCents)}`;
  }
  return 'settled up';
}

/**
 * Where the viewer stands against a group, in words — used both for a
 * group's own balance and for the rolled-up figure over a group and its
 * sub-groups (`docs/specs/balances.md`); the two read identically, since to
 * the viewer they answer the same question.
 */
export function groupBalanceLabel(amountCents: number): string {
  if (amountCents === 0) {
    return 'You’re all settled up';
  }
  if (amountCents > 0) {
    return `You are owed ${centsToText(amountCents)}`;
  }
  return `You owe ${centsToText(-amountCents)}`;
}
