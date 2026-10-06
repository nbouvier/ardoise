import { replaceEqualDeep } from '@tanstack/react-query';

import { preserveOrder } from '@/lib/stable-order';

export interface ListOrderKeeper {
  /** For the list query's `structuralSharing` option. */
  structuralSharing: (previous: unknown, next: unknown) => unknown;
  /** Keep the order already shown through whatever `work` refetches. */
  keepWhile: (work: () => Promise<unknown>) => Promise<void>;
}

/**
 * Keeps a list's rows in the order already shown (`preserveOrder`) through
 * the reads made during `keepWhile` — and only those: every other read is
 * trusted for order. Applied as the data arrives, never during a render.
 * Create one per list, once (`useState(() => createListOrderKeeper(…))`).
 */
export function createListOrderKeeper<T>(idOf: (item: T) => string): ListOrderKeeper {
  let keeping = 0;

  return {
    structuralSharing(previous, next) {
      const ordered =
        keeping > 0 && Array.isArray(previous)
          ? preserveOrder((previous as T[]).map(idOf), next as T[], idOf)
          : next;
      return replaceEqualDeep(previous, ordered);
    },

    async keepWhile(work) {
      keeping += 1;
      try {
        await work();
      } finally {
        keeping -= 1;
      }
    },
  };
}
