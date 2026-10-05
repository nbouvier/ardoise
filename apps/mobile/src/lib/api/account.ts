import { accountDeletionPreviewSchema, type AccountDeletionPreview } from '@ardoise/shared';

import { expectNoContent, parsedJson, type AuthorizedFetch } from './client';

/** What deleting the account would lose: friends, and every group where the balance is not zero. */
export async function fetchDeletionPreview(
  fetcher: AuthorizedFetch,
): Promise<AccountDeletionPreview> {
  const response = await fetcher('/me/deletion-preview');
  return parsedJson(response, accountDeletionPreviewSchema);
}

/** Delete the caller's own account, for good (`docs/specs/account-deletion.md`). */
export async function deleteOwnAccount(fetcher: AuthorizedFetch): Promise<void> {
  const response = await fetcher('/me', { method: 'DELETE' });
  await expectNoContent(response);
}
