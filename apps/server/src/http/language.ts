/**
 * The language of a public page (`docs/specs/legal-pages.md`): French or
 * English, the app itself staying in English.
 */

export type Language = 'fr' | 'en';

const LANGUAGES: readonly Language[] = ['fr', 'en'];

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/**
 * `?lang=` when it names a supported language, else the first supported one in
 * the `Accept-Language` header's order of preference, else English.
 */
export function pickLanguage(requested: unknown, acceptLanguage: string | undefined): Language {
  if (isLanguage(requested)) {
    return requested;
  }
  const preferred = (acceptLanguage ?? '')
    .split(',')
    .map((entry, index) => {
      const [tag = '', ...params] = entry.trim().split(';');
      const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
      const weight = q === undefined ? 1 : Number(q.slice(2));
      return { primary: tag.trim().toLowerCase().split('-')[0], weight, index };
    })
    .filter(({ weight }) => Number.isFinite(weight) && weight > 0)
    // Highest weight first; equal weights keep the header's order.
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .find(({ primary }) => isLanguage(primary));
  return (preferred?.primary as Language | undefined) ?? 'en';
}
