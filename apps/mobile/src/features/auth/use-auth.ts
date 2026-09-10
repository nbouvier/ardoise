import { useAuthContext, type AuthContextValue } from './auth-context';

/** Access the authentication state and actions. Must be under `<AuthProvider>`. */
export function useAuth(): AuthContextValue {
  return useAuthContext();
}
