import { GoogleSignInError, type GoogleModule } from './google-module';

/**
 * Web build stub. Native Google sign-in is not wired for the web target yet
 * (see `docs/specs/authentication.md`); the sign-in screen disables the action.
 */
export const googleSignIn: GoogleModule = {
  available: false,

  async signIn(): Promise<string> {
    throw new GoogleSignInError('Google sign-in is not available on the web yet');
  },

  async signOut(): Promise<void> {
    // nothing to clear
  },
};
