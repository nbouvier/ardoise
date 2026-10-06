import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import { ApiError } from '@/lib/api/errors';
import { errorFields, logger } from '@/lib/logger';

/**
 * Retry a failed read once, after TanStack Query's own short delay — but never
 * a refusal (4xx): asking again gets the same answer, and a `404` is how a
 * deleted group shows up.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}

/**
 * The cache every screen reads the server's data through. Not a source of
 * truth: each read refetches when its screen mounts, and every change
 * invalidates what it affects (`useInvalidation`), so what is cached is only
 * what is shown while the fresh answer is on its way.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry },
      mutations: { retry: false },
    },
  });
}

/**
 * The app coming back to the foreground counts as focus, so what is on screen
 * is refetched then — React Native has no window focus of its own.
 */
export function followAppFocus(): () => void {
  if (Platform.OS === 'web') {
    return () => {};
  }
  const subscription = AppState.addEventListener('change', (status) => {
    focusManager.setFocused(status === 'active');
  });
  return () => subscription.remove();
}

/** `read`, with a failure logged as `event` before it reaches the query's error state. */
export async function loggedRead<T>(event: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error: unknown) {
    logger.warn(event, errorFields(error));
    throw error;
  }
}

export type ReadStatus = 'loading' | 'ready' | 'error';

/**
 * A query as the screens have always read it: `loading` until there is
 * something to show — including while a failed read is being retried by
 * hand — `error` when the last read failed, `ready` otherwise. A refetch of
 * data already shown stays `ready`: the rows stay up until the new ones land.
 */
export function readStatus(query: {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
}): ReadStatus {
  if (query.isError) {
    return query.isFetching ? 'loading' : 'error';
  }
  return query.isPending ? 'loading' : 'ready';
}
