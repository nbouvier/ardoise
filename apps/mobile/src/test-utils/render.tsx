import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as baseRender } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

/**
 * A cache like the app's, minus what makes tests slow or order-dependent: no
 * retry (a failed read shows its error state at once) and no garbage
 * collection timer left running after the test.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

/**
 * `render` from Testing Library, inside a fresh query cache — what every
 * screen reading server data needs above it. The cache is returned too, for a
 * test standing in for a change made elsewhere in the app.
 */
export async function render(
  ui: ReactElement,
  { queryClient = createTestQueryClient() }: { queryClient?: QueryClient } = {},
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const result = await baseRender(ui, { wrapper });
  return { ...result, queryClient };
}
