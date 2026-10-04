import type { Balance } from '@ardoise/shared';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { fetchBalances } from '@/lib/api/transactions';
import { errorFields, logger } from '@/lib/logger';

export type BalancesStatus = 'loading' | 'ready' | 'error';

export interface UseBalancesResult {
  status: BalancesStatus;
  balances: Balance[];
  refresh: () => void;
}

/** Every current member's net balance in the group. Positive: owed to them. */
export function useBalances(groupId: string): UseBalancesResult {
  const { authorizedFetch } = useAuth();
  const [status, setStatus] = useState<BalancesStatus>('loading');
  const [balances, setBalances] = useState<Balance[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    fetchBalances(authorizedFetch, groupId)
      .then((loaded) => {
        if (active) {
          setBalances(loaded);
          setStatus('ready');
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        logger.warn('balances.load.failed', errorFields(error));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [authorizedFetch, groupId, reloadToken]);

  const refresh = useCallback(() => {
    setStatus('loading');
    setReloadToken((token) => token + 1);
  }, []);

  return { status, balances, refresh };
}
