import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';

import {
  GoogleSignInCancelled,
  GoogleSignInError,
  type GoogleModule,
} from './google-module';

let configured = false;

function stringExtra(key: string): string | undefined {
  const value = Constants.expoConfig?.extra?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function configure(): void {
  if (configured) {
    return;
  }
  GoogleSignin.configure({
    webClientId: stringExtra('googleWebClientId'),
    iosClientId: stringExtra('googleIosClientId'),
    offlineAccess: false,
  });
  configured = true;
}

export const googleSignIn: GoogleModule = {
  available: true,

  async signIn() {
    configure();
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) {
        throw new GoogleSignInCancelled();
      }
      const { idToken } = response.data;
      if (!idToken) {
        throw new GoogleSignInError('Google did not return an ID token');
      }
      return idToken;
    } catch (error) {
      if (error instanceof GoogleSignInCancelled || error instanceof GoogleSignInError) {
        throw error;
      }
      if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
        throw new GoogleSignInCancelled();
      }
      throw new GoogleSignInError(
        error instanceof Error ? error.message : 'Google sign-in failed',
      );
    }
  },

  async signOut() {
    try {
      await GoogleSignin.signOut();
    } catch {
      // best effort — the local session is cleared regardless
    }
  },
};
