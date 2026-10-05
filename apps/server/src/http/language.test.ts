import { describe, expect, it } from 'vitest';

import { pickLanguage } from './language.js';

describe('pickLanguage', () => {
  it('follows an explicit lang over the browser', () => {
    expect(pickLanguage('en', 'fr-FR,fr;q=0.9')).toBe('en');
    expect(pickLanguage('fr', 'en-US')).toBe('fr');
  });

  it('ignores a lang it does not know and falls back to the browser', () => {
    expect(pickLanguage('de', 'fr-FR')).toBe('fr');
    expect(pickLanguage(['fr'], 'en')).toBe('en');
  });

  it.each([
    ['fr-FR,fr;q=0.9,en;q=0.8', 'fr'],
    ['en-GB,en;q=0.9,fr;q=0.8', 'en'],
    // The first supported language in order of preference, not the first listed.
    ['de-DE,fr;q=0.9,en;q=0.8', 'fr'],
    ['en;q=0.5,fr;q=0.8', 'fr'],
    ['FR', 'fr'],
    // q=0 means "not this one".
    ['fr;q=0,en;q=0.1', 'en'],
  ])('reads %j as %s', (header, expected) => {
    expect(pickLanguage(undefined, header)).toBe(expected);
  });

  it('falls back to English with no header or no supported language', () => {
    expect(pickLanguage(undefined, undefined)).toBe('en');
    expect(pickLanguage(undefined, '')).toBe('en');
    expect(pickLanguage(undefined, 'de-DE,es;q=0.9')).toBe('en');
    expect(pickLanguage(undefined, '*')).toBe('en');
  });
});
