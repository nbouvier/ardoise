import type { Language } from '../../http/language.js';
import type { MailMessage } from '../../mail/mailer.js';

/**
 * The e-mails of `docs/specs/password-sign-in.md`, in French or English.
 *
 * Nothing a requester typed goes into them — not even the name given at
 * sign-up: anyone can make Ardoise e-mail any address, and must not be able
 * to put words of their own in that mailbox. Only the code, which the server
 * made, varies.
 */

interface Content {
  subject: string;
  /** Paragraphs; `{code}` stands for the code, shown on its own between them in HTML. */
  paragraphs: string[];
}

function render(to: string, content: Content, code?: string): MailMessage {
  const text = content.paragraphs
    .map((paragraph) => (code ? paragraph.replace('{code}', code) : paragraph))
    .join('\n\n');
  const html = content.paragraphs
    .map((paragraph) =>
      code && paragraph.includes('{code}')
        ? `<p>${paragraph.replace('{code}', '').trim()}</p>` +
          `<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>`
        : `<p>${paragraph}</p>`,
    )
    .join('\n');
  return {
    to,
    subject: code ? content.subject.replace('{code}', code) : content.subject,
    text,
    html: `<!doctype html>\n<html><body style="font-family:sans-serif;line-height:1.5">\n${html}\n</body></html>`,
  };
}

const VALIDITY = {
  fr: 'Il est valable 15 minutes.',
  en: 'It is valid for 15 minutes.',
};

const SIGNUP_CODE: Record<Language, Content> = {
  fr: {
    subject: 'Votre code Ardoise : {code}',
    paragraphs: [
      'Voici votre code pour créer votre compte Ardoise : {code}',
      VALIDITY.fr,
      'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : aucun compte ne sera créé.',
    ],
  },
  en: {
    subject: 'Your Ardoise code: {code}',
    paragraphs: [
      'Here is your code to create your Ardoise account: {code}',
      VALIDITY.en,
      'If you did not ask for it, ignore this e-mail: no account will be created.',
    ],
  },
};

const ADD_PASSWORD_CODE: Record<Language, Content> = {
  fr: {
    subject: 'Votre code Ardoise : {code}',
    paragraphs: [
      'Vous avez déjà un compte Ardoise, auquel vous vous connectez avec Google. Voici votre code pour lui ajouter un mot de passe : {code}',
      `${VALIDITY.fr} Ensuite, vous pourrez vous connecter avec cette adresse et ce mot de passe, comme avec Google.`,
      'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre compte reste tel quel.',
    ],
  },
  en: {
    subject: 'Your Ardoise code: {code}',
    paragraphs: [
      'You already have an Ardoise account, which you sign in to with Google. Here is your code to add a password to it: {code}',
      `${VALIDITY.en} Then you can sign in with this address and that password, as well as with Google.`,
      'If you did not ask for it, ignore this e-mail: your account stays as it is.',
    ],
  },
};

const ACCOUNT_EXISTS: Record<Language, Content> = {
  fr: {
    subject: 'Votre compte Ardoise',
    paragraphs: [
      'Quelqu’un, probablement vous, a voulu créer un compte Ardoise avec cette adresse e-mail. Vous en avez déjà un.',
      'Connectez-vous avec votre mot de passe, ou choisissez « Mot de passe oublié ? » sur l’écran de connexion pour en définir un nouveau.',
      'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : rien n’a changé.',
    ],
  },
  en: {
    subject: 'Your Ardoise account',
    paragraphs: [
      'Someone, probably you, tried to create an Ardoise account with this e-mail address. You already have one.',
      'Sign in with your password, or choose “Forgot password?” on the sign-in screen to set a new one.',
      'If it was not you, ignore this e-mail: nothing has changed.',
    ],
  },
};

/** The code that creates an account, or adds a password to the Google-only one. */
export function signupCodeEmail(
  to: string,
  code: string,
  lang: Language,
  existingAccount: boolean,
): MailMessage {
  return render(to, (existingAccount ? ADD_PASSWORD_CODE : SIGNUP_CODE)[lang], code);
}

/** Sent instead of a code when the address already has an account with a password. */
export function accountExistsEmail(to: string, lang: Language): MailMessage {
  return render(to, ACCOUNT_EXISTS[lang]);
}
