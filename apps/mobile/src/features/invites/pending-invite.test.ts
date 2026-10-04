import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { parseInviteUrl, pendingInvite } from './pending-invite';

const CODE = 'Zx3k9QpL2mN7vR1sT4uW8g';

beforeEach(() => {
  pendingInvite.clear();
});

describe('parseInviteUrl', () => {
  it('reads a code from the app deep link', () => {
    expect(parseInviteUrl(`ardoise://invite/${CODE}`)).toBe(CODE);
  });

  it('reads a code from the landing-page URL', () => {
    expect(parseInviteUrl(`https://api.splitcount.test/i/${CODE}`)).toBe(CODE);
  });

  it('ignores a query string or fragment', () => {
    expect(parseInviteUrl(`https://api.test/i/${CODE}?utm=whatsapp`)).toBe(CODE);
    expect(parseInviteUrl(`ardoise://invite/${CODE}#x`)).toBe(CODE);
  });

  it('tolerates the host-style deep link Expo produces', () => {
    // `ardoise://` links can arrive with the first segment parsed as a host.
    expect(parseInviteUrl(`ardoise://app/invite/${CODE}`)).toBe(CODE);
  });

  it('ignores URLs that are not invitations', () => {
    expect(parseInviteUrl('ardoise://account')).toBeNull();
    expect(parseInviteUrl('https://example.com/')).toBeNull();
    expect(parseInviteUrl(null)).toBeNull();
    expect(parseInviteUrl(undefined)).toBeNull();
  });

  it('rejects a code that cannot be one', () => {
    expect(parseInviteUrl('ardoise://invite/short')).toBeNull();
    expect(parseInviteUrl('https://api.test/i/has spaces in it')).toBeNull();
  });
});

describe('pendingInvite', () => {
  it('holds a code and notifies subscribers', () => {
    const listener = jest.fn();
    const unsubscribe = pendingInvite.subscribe(listener);

    pendingInvite.set(CODE);

    expect(pendingInvite.getSnapshot()).toBe(CODE);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does not notify when the code is unchanged', () => {
    pendingInvite.set(CODE);
    const listener = jest.fn();
    pendingInvite.subscribe(listener);

    pendingInvite.set(CODE);

    expect(listener).not.toHaveBeenCalled();
  });

  it('trims a pasted code and drops a malformed one', () => {
    pendingInvite.set(`  ${CODE} `);
    expect(pendingInvite.getSnapshot()).toBe(CODE);

    pendingInvite.set('nope');
    expect(pendingInvite.getSnapshot()).toBeNull();
  });

  it('clears the pending code', () => {
    pendingInvite.set(CODE);
    pendingInvite.clear();
    expect(pendingInvite.getSnapshot()).toBeNull();
  });

  it('stops notifying after unsubscribe', () => {
    const listener = jest.fn();
    pendingInvite.subscribe(listener)();

    pendingInvite.set(CODE);

    expect(listener).not.toHaveBeenCalled();
  });
});
