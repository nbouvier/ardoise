import type { NetPosition, ReimbursementScope, SuggestedReimbursement } from '@splitcount/shared';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { fetchReimbursements } from '@/lib/api/transactions';
import { errorFields, logger } from '@/lib/logger';

export type ReimbursementsStatus = 'loading' | 'ready' | 'error';

export interface UseReimbursementsResult {
  status: ReimbursementsStatus;
  /** Where everyone stands over the scope, each with the groups it comes from. */
  positions: NetPosition[];
  /** The payments that clear it, largest first. Empty when settled. */
  reimbursements: SuggestedReimbursement[];
  refresh: () => void;
}

/**
 * Who should pay whom to clear a group, re-read whenever the scope changes
 * (`docs/specs/reimbursements.md`). Nothing is derived on the client: the
 * plan and the positions come from the server together, so the two can never
 * disagree about what is owed.
 *
 * A failure never degrades to "settled" — the caller gets `error` and a
 * retry, because a plan that wrongly reads as settled is the worst thing
 * this screen could say.
 */
export function useReimbursements(
  groupId: string,
  scope: ReimbursementScope,
): UseReimbursementsResult {
  const { authorizedFetch } = useAuth();
  const [status, setStatus] = useState<ReimbursementsStatus>('loading');
  const [positions, setPositions] = useState<NetPosition[]>([]);
  const [reimbursements, setReimbursements] = useState<SuggestedReimbursement[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    fetchReimbursements(authorizedFetch, groupId, scope)
      .then((plan) => {
        if (active) {
          setPositions(plan.positions);
          setReimbursements(plan.reimbursements);
          setStatus('ready');
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        logger.warn('reimbursements.load.failed', errorFields(error));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [authorizedFetch, groupId, scope, reloadToken]);

  const refresh = useCallback(() => {
    setStatus('loading');
    setReloadToken((token) => token + 1);
  }, []);

  return { status, positions, reimbursements, refresh };
}
