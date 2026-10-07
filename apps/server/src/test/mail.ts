import type { Mailer, MailMessage } from '../mail/mailer.js';

export interface MemoryMailer extends Mailer {
  /** Every message sent so far, oldest first. */
  readonly sent: MailMessage[];
  /** The messages sent to one address. */
  to(address: string): MailMessage[];
  /** The 6-digit code in the last message sent to `address`. Throws if there is none. */
  lastCode(address: string): string;
  /** Fail every send from now on, as an unreachable provider would. */
  failing: boolean;
}

/**
 * A mailer that keeps what it is given, for tests to read the codes from. It
 * records synchronously, so a message sent without being awaited (as the auth
 * routes do) is there as soon as the response is.
 */
export function memoryMailer(): MemoryMailer {
  const sent: MailMessage[] = [];
  const mailer: MemoryMailer = {
    sent,
    failing: false,
    send(message) {
      if (mailer.failing) {
        return Promise.reject(new Error('mail transport down'));
      }
      sent.push(message);
      return Promise.resolve();
    },
    to(address) {
      return sent.filter((message) => message.to === address);
    },
    lastCode(address) {
      const last = mailer.to(address).at(-1);
      const code = last?.text.match(/\b\d{6}\b/)?.[0];
      if (!code) {
        throw new Error(`no code was sent to ${address}`);
      }
      return code;
    },
  };
  return mailer;
}
