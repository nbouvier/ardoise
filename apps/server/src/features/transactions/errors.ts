/**
 * Why a transaction operation is refused, once the caller's membership in the
 * group has already been confirmed (that check is `GroupAccessError`, reused
 * as-is from `groups` — see `service.ts`).
 */
export type TransactionErrorReason =
  | 'not_found'
  | 'not_group_member'
  | 'invalid_split';

export class TransactionError extends Error {
  constructor(readonly reason: TransactionErrorReason) {
    super(`Transaction refused: ${reason}`);
    this.name = 'TransactionError';
  }
}
