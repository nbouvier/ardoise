import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { AccessTokenError, createAccessTokenService } from './tokens.js';

const SECRET = 'unit-test-secret-at-least-16-chars';

describe('access token service', () => {
  it('issues a token that verifies back to the same user', async () => {
    const service = createAccessTokenService(SECRET, 900);

    const { token, expiresAt } = await service.issue('user-1');
    const { userId } = await service.verify(token);

    expect(userId).toBe('user-1');
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects an expired token', async () => {
    const service = createAccessTokenService(SECRET, -1);

    const { token } = await service.issue('user-1');

    await expect(service.verify(token)).rejects.toMatchObject({
      name: 'AccessTokenError',
      reason: 'expired',
    });
  });

  it('rejects a token signed with a different secret', async () => {
    const issuer = createAccessTokenService('another-secret-at-least-16-chars', 900);
    const verifier = createAccessTokenService(SECRET, 900);

    const { token } = await issuer.issue('user-1');

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(AccessTokenError);
  });

  it('rejects a token signed with another algorithm, even with the right secret', async () => {
    const verifier = createAccessTokenService(SECRET, 900);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS512' })
      .setSubject('user-1')
      .setIssuer('ardoise')
      .setAudience('ardoise')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(SECRET));

    await expect(verifier.verify(token)).rejects.toMatchObject({ reason: 'invalid' });
  });

  it('rejects a malformed token', async () => {
    const service = createAccessTokenService(SECRET, 900);

    await expect(service.verify('not-a-jwt')).rejects.toMatchObject({ reason: 'invalid' });
  });
});
