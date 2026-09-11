import * as Linking from 'expo-linking';
import { useEffect } from 'react';

import { logger } from '@/lib/logger';

import { parseInviteUrl, pendingInvite } from './pending-invite';

/**
 * Captures an invitation code from the URL the app was opened with.
 *
 * Mounted above the auth gate on purpose: someone following a link may have no
 * account at all. The code is parked in `pendingInvite`, survives the sign-in
 * screen, and is picked up by `InvitePrompt` once a session exists.
 */
export function InviteLinkHandler() {
  const url = Linking.useURL();

  useEffect(() => {
    const code = parseInviteUrl(url);
    if (code) {
      logger.info('friends.invite.link.received');
      pendingInvite.set(code);
    }
  }, [url]);

  return null;
}
