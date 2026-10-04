import {
  acceptInviteResponseSchema,
  invitePreviewResponseSchema,
  type AcceptInviteResult,
  type InvitePreview,
} from '@ardoise/shared';

import { parsedJson, type AuthorizedFetch } from './client';
import { apiRequest } from './endpoints';

/**
 * What the code leads to. **Unauthenticated**: the recipient sees this before
 * deciding to sign in, so it cannot go through `authorizedFetch`.
 */
export async function previewInvite(
  baseUrl: string,
  code: string,
): Promise<InvitePreview> {
  const response = await apiRequest(baseUrl, {
    method: 'GET',
    path: `/invites/${encodeURIComponent(code)}`,
  });
  return (await parsedJson(response, invitePreviewResponseSchema)).invite;
}

/** Accept, as the signed-in user. Idempotent — accepting twice is not an error. */
export async function acceptInvite(
  fetcher: AuthorizedFetch,
  code: string,
): Promise<AcceptInviteResult> {
  const response = await fetcher(`/invites/${encodeURIComponent(code)}/accept`, {
    method: 'POST',
  });
  return (await parsedJson(response, acceptInviteResponseSchema)).result;
}
