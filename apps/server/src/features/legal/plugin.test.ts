import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestContext } from '../../test/app.js';

const identity = {
  publisherName: 'Jane <b>Doe</b>',
  contact: 'contact@example.com',
  hostName: 'Example Hosting',
  hostAddress: '1 Example Street, 75000 Paris, France',
  hostPhone: '+33 1 00 00 00 00',
};

const PAGES = ['/privacy', '/terms', '/legal'] as const;

/** `docs/specs/legal-pages.md`. */
describe('legal pages', () => {
  let app: FastifyInstance;
  const logs: Record<string, unknown>[] = [];

  beforeAll(async () => {
    ({ app } = await createTestContext({
      legal: { identity },
      log: { level: 'info', stream: { write: (line) => logs.push(JSON.parse(line)) } },
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logs.length = 0;
  });

  function get(url: string, acceptLanguage?: string) {
    return app.inject({
      method: 'GET',
      url,
      headers: acceptLanguage ? { 'accept-language': acceptLanguage } : {},
    });
  }

  it.each(PAGES)('serves %s publicly, as a locked-down HTML page', async (path) => {
    const response = await get(path);

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers.vary).toContain('Accept-Language');
  });

  it.each(PAGES)('serves %s in the language asked for, linking to the other one', async (path) => {
    const french = await get(path, 'fr-FR,fr;q=0.9');
    const english = await get(path, 'en-GB');
    const forced = await get(`${path}?lang=en`, 'fr-FR');

    expect(french.body).toContain('<html lang="fr">');
    expect(french.body).toContain(`href="${path}?lang=en"`);
    expect(french.body).toContain('Dernière mise à jour');
    expect(english.body).toContain('<html lang="en">');
    expect(english.body).toContain(`href="${path}?lang=fr"`);
    expect(english.body).toContain('Last updated');
    expect(english.body).toContain('the French version prevails');
    expect(forced.body).toBe(english.body);
  });

  it.each(PAGES)('links %s to the four public pages', async (path) => {
    const response = await get(path, 'fr');

    for (const target of ['/privacy', '/terms', '/legal', '/delete-account']) {
      expect(response.body).toContain(`href="${target}?lang=fr"`);
    }
  });

  it('names the publisher and the host on the legal notice, escaped, without an address of the publisher', async () => {
    const response = await get('/legal?lang=fr');

    expect(response.body).toContain('Jane &lt;b&gt;Doe&lt;/b&gt;');
    expect(response.body).not.toContain('<b>Doe</b>');
    expect(response.body).toContain('mailto:contact@example.com');
    expect(response.body).toContain('Example Hosting<br>1 Example Street, 75000 Paris, France<br>+33 1 00 00 00 00');
    expect(response.body).toContain('à titre personnel et non professionnel');
  });

  it('states what the privacy policy must', async () => {
    const { body } = await get('/privacy?lang=fr');

    for (const statement of [
      'Qui est responsable',
      'mailto:contact@example.com',
      'Les données traitées',
      'Pourquoi, et sur quelle base',
      'Qui voit vos données',
      'Sentry',
      'Expo',
      'Google',
      'Transferts hors de l’Union européenne',
      'jusqu’à 12 mois',
      'Les rapports d’erreur&nbsp;: 30 jours',
      'au plus 60 jours sans',
      'CNIL',
      'Si quelqu’un vous a ajouté par votre nom',
      '15 ans ou plus',
    ]) {
      expect(body).toContain(statement);
    }
  });

  it('states the minimum age, that no money moves and the content rules in the terms', async () => {
    const { body } = await get('/terms?lang=en');

    expect(body).toContain('15 or older');
    expect(body).toContain('holds and moves no money');
    expect(body).toContain('does not guarantee');
    expect(body).toContain('nothing insulting, hateful, defamatory or unlawful');
  });

  it('keeps no client address in the request logs', async () => {
    await app.inject({ method: 'GET', url: '/privacy', remoteAddress: '203.0.113.7' });

    const requestLines = logs.filter((line) => line.req !== undefined);
    expect(requestLines.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain('203.0.113.7');
    expect(requestLines[0]?.req).toEqual({ method: 'GET', url: '/privacy' });
  });
});
