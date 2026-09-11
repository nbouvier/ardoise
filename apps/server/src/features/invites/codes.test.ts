import { describe, expect, it } from 'vitest';

import type { InviteRow } from '../../db/schema.js';

import { assertInviteUsable, generateInviteCode, InviteError } from './codes.js';

const now = new Date('2026-09-10T12:00:00.000Z');

function invite(overrides: Partial<InviteRow> = {}): InviteRow {
  return {
    id: 'invite-1',
    kind: 'friend',
    inviterId: 'user-1',
    groupId: null,
    code: 'code',
    expiresAt: new Date(now.getTime() + 1000),
    createdAt: now,
    revokedAt: null,
    ...overrides,
  };
}

describe('generateInviteCode', () => {
  it('produces a 128-bit base64url code', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('does not repeat', () => {
    const codes = new Set(Array.from({ length: 100 }, generateInviteCode));
    expect(codes.size).toBe(100);
  });
});

describe('assertInviteUsable', () => {
  it('accepts a live invitation', () => {
    expect(() => assertInviteUsable(invite(), now)).not.toThrow();
  });

  it('rejects an unknown code', () => {
    expect(() => assertInviteUsable(undefined, now)).toThrow(
      expect.objectContaining({ reason: 'not_found' }),
    );
  });

  it('rejects a revoked invitation, even before its expiry', () => {
    expect(() => assertInviteUsable(invite({ revokedAt: now }), now)).toThrow(
      expect.objectContaining({ reason: 'revoked' }),
    );
  });

  it('rejects an expired invitation', () => {
    const expired = invite({ expiresAt: new Date(now.getTime() - 1) });
    expect(() => assertInviteUsable(expired, now)).toThrow(
      expect.objectContaining({ reason: 'expired' }),
    );
  });

  it('treats the exact expiry instant as expired', () => {
    expect(() => assertInviteUsable(invite({ expiresAt: now }), now)).toThrow(InviteError);
  });

  it('applies the same rules to a group invitation', () => {
    const groupInvite = invite({ kind: 'group', groupId: 'group-1', revokedAt: now });
    expect(() => assertInviteUsable(groupInvite, now)).toThrow(
      expect.objectContaining({ reason: 'revoked' }),
    );
  });
});
