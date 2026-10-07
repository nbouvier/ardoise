import type { SignupRequest } from '@ardoise/shared';
import { useState } from 'react';

import { ForgotPasswordScreen } from './forgot-password-screen';
import { ResetPasswordScreen } from './reset-password-screen';
import { SignInScreen } from './sign-in-screen';
import { SignUpScreen } from './sign-up-screen';
import { VerifySignUpScreen } from './verify-sign-up-screen';

type Step =
  | { name: 'signIn' }
  | { name: 'signUp' }
  | { name: 'verifySignUp'; request: SignupRequest }
  | { name: 'forgotPassword' }
  | { name: 'resetPassword'; email: string };

/**
 * Everything before a session exists, as steps of one flow rather than
 * routes: the gate shows it in place of the app, so whatever the app was
 * opened on (an invitation link) is still there once signed in.
 */
export function SignedOutFlow() {
  const [step, setStep] = useState<Step>({ name: 'signIn' });
  // Carried between the steps, so the address is typed once.
  const [email, setEmail] = useState('');
  const [draft, setDraft] = useState<Partial<SignupRequest>>({});

  const toSignIn = () => setStep({ name: 'signIn' });

  switch (step.name) {
    case 'signUp':
      return (
        <SignUpScreen
          initial={{ ...draft, email: draft.email ?? email }}
          onBack={toSignIn}
          onCodeSent={(request) => {
            setDraft(request);
            setEmail(request.email);
            setStep({ name: 'verifySignUp', request });
          }}
        />
      );
    case 'verifySignUp':
      return (
        <VerifySignUpScreen request={step.request} onBack={() => setStep({ name: 'signUp' })} />
      );
    case 'forgotPassword':
      return (
        <ForgotPasswordScreen
          email={email}
          onEmailChange={setEmail}
          onBack={toSignIn}
          onCodeSent={(address) => setStep({ name: 'resetPassword', email: address })}
        />
      );
    case 'resetPassword':
      return (
        <ResetPasswordScreen
          email={step.email}
          onBack={() => setStep({ name: 'forgotPassword' })}
        />
      );
    case 'signIn':
      return (
        <SignInScreen
          email={email}
          onEmailChange={setEmail}
          onCreateAccount={() => setStep({ name: 'signUp' })}
          onForgotPassword={() => setStep({ name: 'forgotPassword' })}
        />
      );
  }
}
