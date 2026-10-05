import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { getApiBaseUrl } from '@/lib/api/config';
import { setReportingUser } from '@/lib/error-reporting';

import { AuthClient, type AuthState } from './auth-client';
import { googleSignIn } from './google';
import { secureTokenStore } from './token-store';

export interface AuthContextValue {
  state: AuthState;
  /** Whether interactive Google sign-in works on this platform. */
  googleAvailable: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Delete the account for good, then sign out (`docs/specs/account-deletion.md`). */
  deleteAccount: () => Promise<void>;
  /** Retry restoring the session after a launch connection failure. */
  retry: () => Promise<void>;
  /** Fetch a protected endpoint, refreshing on 401. For feature code. */
  authorizedFetch: AuthClient['authorizedFetch'];
}

const AuthContext = createContext<AuthContextValue | null>(null);

function createDefaultClient(): AuthClient {
  return new AuthClient({
    baseUrl: getApiBaseUrl(),
    google: googleSignIn,
    store: secureTokenStore,
  });
}

export interface AuthProviderProps {
  children: ReactNode;
  /** Inject a pre-configured client (tests). */
  client?: AuthClient;
}

export function AuthProvider({ children, client }: AuthProviderProps) {
  const [authClient] = useState<AuthClient>(() => client ?? createDefaultClient());

  const state = useSyncExternalStore(authClient.subscribe, authClient.getState, authClient.getState);

  useEffect(() => {
    void authClient.bootstrap();
  }, [authClient]);

  // Reports carry who hit them (the opaque id, nothing else), so Sentry can count
  // the users an issue affects.
  const userId = state.status === 'signedIn' ? state.user.id : null;
  useEffect(() => {
    setReportingUser(userId);
  }, [userId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      googleAvailable: authClient.googleAvailable,
      signIn: authClient.signIn,
      signOut: authClient.signOut,
      deleteAccount: authClient.deleteAccount,
      retry: authClient.bootstrap,
      authorizedFetch: authClient.authorizedFetch,
    }),
    [state, authClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return value;
}
