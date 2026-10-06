import { describe, expect, it } from '@jest/globals';

import { redirectSystemPath } from './native-intent';

const CODE = 'Zx3k9QpL2mN7vR1sT4uW8g';

describe('redirectSystemPath', () => {
  it.each([
    `ardoise://invite/${CODE}`,
    `https://api.ardoise.test/i/${CODE}`,
    `https://api.ardoise.test/i/${CODE}?utm=whatsapp`,
  ])('opens the app on its home screen for the invitation link %s', (path) => {
    expect(redirectSystemPath({ path, initial: true })).toBe('/');
    expect(redirectSystemPath({ path, initial: false })).toBe('/');
  });

  it.each(['ardoise://groups/123', '/groups/123', 'https://api.ardoise.test/i/nope'])(
    'routes any other URL as it is (%s)',
    (path) => {
      expect(redirectSystemPath({ path, initial: true })).toBe(path);
    },
  );
});
