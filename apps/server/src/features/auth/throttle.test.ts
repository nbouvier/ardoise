import { describe, expect, it } from 'vitest';

import { AttemptThrottle } from './throttle.js';

describe('AttemptThrottle', () => {
  it('lets a key through until it reaches the limit, then until the window ends', () => {
    let now = 0;
    const throttle = new AttemptThrottle(3, 60_000, () => now);

    for (let i = 0; i < 3; i += 1) {
      expect(throttle.retryAfterSeconds('ada@example.com')).toBe(0);
      throttle.record('ada@example.com');
    }
    expect(throttle.retryAfterSeconds('ada@example.com')).toBe(60);

    now = 45_500;
    expect(throttle.retryAfterSeconds('ada@example.com')).toBe(15);

    now = 60_000;
    expect(throttle.retryAfterSeconds('ada@example.com')).toBe(0);
  });

  it('counts each key on its own', () => {
    const throttle = new AttemptThrottle(1, 60_000, () => 0);

    throttle.record('ada@example.com');

    expect(throttle.retryAfterSeconds('ada@example.com')).toBeGreaterThan(0);
    expect(throttle.retryAfterSeconds('bob@example.com')).toBe(0);
  });

  it('starts a fresh window once the previous one has ended', () => {
    let now = 0;
    const throttle = new AttemptThrottle(2, 1_000, () => now);
    throttle.record('ada@example.com');
    throttle.record('ada@example.com');

    now = 1_000;
    throttle.record('ada@example.com');

    expect(throttle.retryAfterSeconds('ada@example.com')).toBe(0);
  });
});
