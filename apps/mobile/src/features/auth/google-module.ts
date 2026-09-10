/** Platform-agnostic contract for obtaining a Google ID token. */
export interface GoogleModule {
  /** Whether interactive Google sign-in is supported on this platform. */
  available: boolean;
  /** Runs the Google sign-in flow and resolves the ID token. */
  signIn(): Promise<string>;
  /** Clears the local Google session. Best-effort. */
  signOut(): Promise<void>;
}

/** The user dismissed the Google dialog. Not an error to surface. */
export class GoogleSignInCancelled extends Error {
  constructor() {
    super('Google sign-in was cancelled');
    this.name = 'GoogleSignInCancelled';
  }
}

/** Google sign-in failed for a reason worth showing the user. */
export class GoogleSignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleSignInError';
  }
}
