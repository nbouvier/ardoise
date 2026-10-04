import { z } from 'zod';

/**
 * Public shape of a signed-in user, safe to expose to the client. Mirrors the
 * minimum Google profile fields Ardoise stores.
 */
export const userProfileSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string().min(1),
  picture: z.url().nullable(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

/** `POST /auth/google` request: a Google-issued ID token to verify. */
export const googleAuthRequestSchema = z.object({
  idToken: z.string().min(1),
});
export type GoogleAuthRequest = z.infer<typeof googleAuthRequestSchema>;

/** `POST /auth/refresh` request: an opaque Ardoise refresh token. */
export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

/** `POST /auth/logout` request: the refresh token whose session to revoke. */
export const logoutRequestSchema = refreshRequestSchema;
export type LogoutRequest = RefreshRequest;

/**
 * An Ardoise session: a short-lived access token for API calls plus a
 * longer-lived, rotating refresh token. `accessTokenExpiresAt` is an ISO 8601
 * timestamp so the client can refresh proactively.
 */
export const authSessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  accessTokenExpiresAt: z.iso.datetime(),
  user: userProfileSchema,
});
export type AuthSession = z.infer<typeof authSessionSchema>;

/** `GET /auth/me` response. */
export const meResponseSchema = z.object({
  user: userProfileSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;
