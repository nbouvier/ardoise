import { describe, expect, it, vi } from 'vitest';

import { createBrevoMailer, MailDeliveryError, type MailMessage } from './mailer.js';

const message: MailMessage = {
  to: 'ada@example.com',
  subject: 'Your code',
  text: 'Code: 123456',
  html: '<p>Code: 123456</p>',
};

function mailerWith(fetchImpl: typeof fetch) {
  return createBrevoMailer({
    apiKey: 'change-me-brevo-key',
    from: { address: 'no-reply@ardoise.test', name: 'Ardoise' },
    fetch: fetchImpl,
  });
}

describe('createBrevoMailer', () => {
  it('posts the message to Brevo with the API key and the sender', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}', { status: 201 }));

    await mailerWith(fetchImpl).send(message);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['api-key']).toBe('change-me-brevo-key');
    expect(JSON.parse(init?.body as string)).toEqual({
      sender: { email: 'no-reply@ardoise.test', name: 'Ardoise' },
      to: [{ email: 'ada@example.com' }],
      subject: 'Your code',
      textContent: 'Code: 123456',
      htmlContent: '<p>Code: 123456</p>',
    });
  });

  it('fails with the status when Brevo refuses the message, without its body', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response('{"message":"ada@example.com is blocked"}', { status: 400 }),
    );

    const failure = await mailerWith(fetchImpl)
      .send(message)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MailDeliveryError);
    expect((failure as MailDeliveryError).status).toBe(400);
    expect((failure as Error).message).not.toContain('ada@example.com');
  });

  it('fails without a status when Brevo cannot be reached', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed');
    });

    const failure = await mailerWith(fetchImpl)
      .send(message)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MailDeliveryError);
    expect((failure as MailDeliveryError).status).toBeNull();
  });
});
