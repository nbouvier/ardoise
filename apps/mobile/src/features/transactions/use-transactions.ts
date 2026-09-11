import type { Transaction } from '@splitcount/shared';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { fetchTransactions } from '@/lib/api/transactions';
import { errorFields, logger } from '@/lib/logger';

export type TransactionsStatus = 'loading' | 'ready' | 'error';

export interface UseTransactionsResult {
  status: TransactionsStatus;
  transactions: Transaction[];
  refresh: () => void;
  /** Apply a transaction the caller just recorded or edited, without a round trip. */
  upsert: (transaction: Transaction) => void;
  /** Drop a transaction the caller just deleted, without a round trip. */
  remove: (transactionId: string) => void;
}

/** A group's transactions, most recent first — the server does the ordering. */
export function useTransactions(groupId: string): UseTransactionsResult {
  const { authorizedFetch } = useAuth();
  const [status, setStatus] = useState<TransactionsStatus>('loading');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    fetchTransactions(authorizedFetch, groupId)
      .then((loaded) => {
        if (active) {
          setTransactions(loaded);
          setStatus('ready');
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        logger.warn('transactions.load.failed', errorFields(error));
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

  const upsert = useCallback((transaction: Transaction) => {
    setTransactions((current) => {
      const withoutIt = current.filter((t) => t.id !== transaction.id);
      // Most-recent-first, matching the server's own ordering: by date, then
      // by recording order for same-day entries.
      return [transaction, ...withoutIt].sort((a, b) => {
        if (a.occurredOn !== b.occurredOn) {
          return a.occurredOn < b.occurredOn ? 1 : -1;
        }
        return a.createdAt < b.createdAt ? 1 : -1;
      });
    });
  }, []);

  const remove = useCallback((transactionId: string) => {
    setTransactions((current) => current.filter((t) => t.id !== transactionId));
  }, []);

  return { status, transactions, refresh, upsert, remove };
}
