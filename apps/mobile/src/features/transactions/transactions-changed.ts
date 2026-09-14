import { createChangeSignal } from '@/lib/change-signal';

/**
 * Announces that a transaction was recorded, edited or deleted somewhere
 * other than the screen showing it — the home screen's latest-transactions
 * section spans every group the viewer belongs to (`docs/specs/home.md`), so
 * it has no other way to know a group it is not looking at just changed.
 */
export const transactionsChanged = createChangeSignal();
