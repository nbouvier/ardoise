import { z } from 'zod';

import type { AccountRepository, DeletionSummary } from './repository.js';

export type OperatorDeletion =
  | { userId: string; outcome: 'deleted'; summary: DeletionSummary }
  /** Not in this database: already deleted, or restored from before it existed. Listed anyway. */
  | { userId: string; outcome: 'absent' }
  | { userId: string; outcome: 'invalid' };

export interface OperatorLog {
  info(fields: Record<string, unknown>, event: string): void;
  warn(fields: Record<string, unknown>, event: string): void;
}

const userIdSchema = z.uuid();

/**
 * What the operator command does with each id it is given
 * (`docs/OPERATIONS.md`, "Deleted accounts"): delete the account exactly as
 * the app does, or — when it is not in this database — make sure it is still
 * on the deleted-accounts list, so a later restore re-applies it too. One by
 * one, so one failure does not undo the others.
 */
export async function deleteAccounts(
  repository: AccountRepository,
  userIds: readonly string[],
  log: OperatorLog,
): Promise<OperatorDeletion[]> {
  const results: OperatorDeletion[] = [];
  for (const raw of userIds) {
    const parsed = userIdSchema.safeParse(raw.trim());
    if (!parsed.success) {
      // Not echoed back: whatever was pasted here is not an id, and could be anything.
      log.warn({ position: results.length }, 'account.delete.invalid_id');
      results.push({ userId: raw, outcome: 'invalid' });
      continue;
    }
    const userId = parsed.data;
    const summary = await repository.deleteAccount(userId);
    if (summary) {
      log.info({ userId, source: 'operator', ...summary }, 'account.deleted');
      results.push({ userId, outcome: 'deleted', summary });
    } else {
      await repository.recordDeleted(userId);
      log.info({ userId }, 'account.delete.absent');
      results.push({ userId, outcome: 'absent' });
    }
  }
  return results;
}
