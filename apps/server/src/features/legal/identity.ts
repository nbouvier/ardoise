import { env } from '../../config/env.js';
import { escapeHtml } from '../../http/html.js';

/**
 * Who publishes and hosts Ardoise (`docs/specs/legal-pages.md`). Personal data
 * and infrastructure details: always from the deployment's configuration, never
 * written in this public repository.
 */
export interface LegalIdentity {
  publisherName: string;
  contact: string;
  hostName: string;
  hostAddress: string;
  hostPhone: string;
}

/** Shown in place of a value a development server was not given; production refuses to start without them. */
const NOT_CONFIGURED = '(not configured)';

export function legalIdentityFromEnv(): LegalIdentity {
  return {
    publisherName: env.LEGAL_PUBLISHER_NAME ?? NOT_CONFIGURED,
    contact: env.CONTACT_EMAIL ?? 'contact@example.com',
    hostName: env.LEGAL_HOST_NAME ?? NOT_CONFIGURED,
    hostAddress: env.LEGAL_HOST_ADDRESS ?? NOT_CONFIGURED,
    hostPhone: env.LEGAL_HOST_PHONE ?? NOT_CONFIGURED,
  };
}

/** The contact address as a link, escaped. */
export function mailto(contact: string): string {
  const address = escapeHtml(contact);
  return `<a href="mailto:${address}">${address}</a>`;
}
