import type { FastifyBaseLogger } from 'fastify';

import type { Env } from '../config/env.js';

/** One e-mail to one recipient, in plain text and HTML. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Raised when the provider does not accept a message. `status` is its HTTP status, if any. */
export class MailDeliveryError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'MailDeliveryError';
  }
}

/**
 * Writes each message to the log instead of sending it: the local-development
 * transport, where reading the code in the server's output is the point. The
 * configuration refuses it in production (`MAIL_TRANSPORT`), since the codes it
 * logs are secrets anywhere real.
 */
export function createLogMailer(log: FastifyBaseLogger): Mailer {
  return {
    async send(message) {
      log.info({ to: message.to, subject: message.subject, text: message.text }, 'mail.logged');
    },
  };
}

export interface BrevoMailerOptions {
  apiKey: string;
  from: { address: string; name: string };
  /** Injected in tests; the global `fetch` otherwise. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';

/** Sends through Brevo's transactional e-mail API. */
export function createBrevoMailer(options: BrevoMailerOptions): Mailer {
  const send = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  return {
    async send(message) {
      let response: Response;
      try {
        response = await send(BREVO_SEND_URL, {
          method: 'POST',
          headers: {
            'api-key': options.apiKey,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({
            sender: { email: options.from.address, name: options.from.name },
            to: [{ email: message.to }],
            subject: message.subject,
            textContent: message.text,
            htmlContent: message.html,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const reason = error instanceof Error ? error.name : 'unknown';
        throw new MailDeliveryError(null, `Brevo unreachable (${reason})`);
      }
      if (!response.ok) {
        // The body may name the recipient: only the status leaves this function.
        throw new MailDeliveryError(
          response.status,
          `Brevo refused the message (${response.status})`,
        );
      }
    },
  };
}

/** The transport the configuration names. */
export function createMailer(
  env: Pick<Env, 'MAIL_TRANSPORT' | 'BREVO_API_KEY' | 'MAIL_FROM_ADDRESS' | 'MAIL_FROM_NAME'>,
  log: FastifyBaseLogger,
): Mailer {
  if (env.MAIL_TRANSPORT === 'log') {
    return createLogMailer(log);
  }
  // Both are checked present when the transport is `brevo` (`config/env.ts`).
  return createBrevoMailer({
    apiKey: env.BREVO_API_KEY!,
    from: { address: env.MAIL_FROM_ADDRESS!, name: env.MAIL_FROM_NAME },
  });
}
