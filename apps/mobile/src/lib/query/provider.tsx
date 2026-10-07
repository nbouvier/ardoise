import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

import { createQueryClient, followAppFocus } from './client';

/**
 * The cache, for one signed-in session: mounted under the auth gate, so
 * signing out drops it with everything it held, and the next account starts
 * from nothing.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);

  useEffect(() => followAppFocus(), []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
