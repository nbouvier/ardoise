import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';

import { getApiBaseUrl } from '@/lib/api/config';
import { errorFields, logger } from '@/lib/logger';

/**
 * The legal pages the server publishes (`docs/specs/legal-pages.md`). No
 * `?lang`: the in-app browser sends the device's languages, and the server
 * answers in French or English from them.
 */
export const LEGAL_PAGES = {
  privacy: { path: '/privacy', label: 'Privacy policy' },
  terms: { path: '/terms', label: 'Terms of use' },
  legal: { path: '/legal', label: 'Legal notice' },
} as const;

export type LegalPage = keyof typeof LEGAL_PAGES;

/** Open one of the legal pages in the in-app browser. */
export async function openLegalPage(page: LegalPage): Promise<void> {
  try {
    await openBrowserAsync(`${getApiBaseUrl()}${LEGAL_PAGES[page].path}`, {
      presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
    });
  } catch (caught) {
    logger.warn('legal.page.open.failed', { page, ...errorFields(caught) });
  }
}
