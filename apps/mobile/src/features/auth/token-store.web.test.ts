import { beforeEach, describe, expect, it } from '@jest/globals';

import { tokenStore } from './token-store.web';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'a@example.com',
  name: 'Ada',
  picture: null,
  hasPassword: true,
};

/** A plain in-memory `localStorage`, the test runtime having none. */
function installLocalStorage(): Map<string, string> {
  const items = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
      removeItem: (key: string) => items.delete(key),
    },
  });
  return items;
}

describe('the web token store', () => {
  let items: Map<string, string>;

  beforeEach(() => {
    items = installLocalStorage();
  });

  it('keeps the profile and never a refresh token', async () => {
    await tokenStore.save({ refreshToken: 'must-not-be-kept', user });

    expect([...items.values()].join()).not.toContain('must-not-be-kept');
    await expect(tokenStore.load()).resolves.toEqual({ refreshToken: null, user });
  });

  it('forgets the session on clear', async () => {
    await tokenStore.save({ refreshToken: null, user });
    await tokenStore.clear();

    await expect(tokenStore.load()).resolves.toBeNull();
  });

  it('loads nothing from an unreadable entry', async () => {
    items.set('ardoise.session', '{not json');

    await expect(tokenStore.load()).resolves.toBeNull();
  });
});
