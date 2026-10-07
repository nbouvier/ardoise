import { z } from 'zod';

/**
 * Public shape of a signed-in user, safe to expose to the client: the minimum
 * profile fields Ardoise stores, and whether the account can sign in with a
 * password (`docs/specs/password-sign-in.md`).
 */
export const userProfileSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string().min(1),
  picture: z.url().nullable(),
  hasPassword: z.boolean(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

/**
 * An e-mail address as an account is looked up by: trimmed and lowercased, so
 * one address is one account whatever its case.
 */
export const emailAddressSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** A password: 8 to 128 characters, no rule on what they are. Never trimmed. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

/** The name a person signs up with, shown to the groups they join. */
export const accountNameSchema = z.string().trim().min(1).max(60);

/** A code e-mailed to prove an address: 6 digits. */
export const emailCodeSchema = z.string().regex(/^\d{6}$/);

/** `POST /auth/password` request. Any non-empty password: the rules apply when one is set. */
export const passwordSignInRequestSchema = z.object({
  email: emailAddressSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type PasswordSignInRequest = z.infer<typeof passwordSignInRequestSchema>;

/** `POST /auth/signup` request. */
export const signupRequestSchema = z.object({
  name: accountNameSchema,
  email: emailAddressSchema,
  password: passwordSchema,
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

/** `POST /auth/signup/verify` request. */
export const signupVerifyRequestSchema = z.object({
  email: emailAddressSchema,
  code: emailCodeSchema,
});
export type SignupVerifyRequest = z.infer<typeof signupVerifyRequestSchema>;

/** `POST /auth/password-reset` request. */
export const passwordResetRequestSchema = z.object({
  email: emailAddressSchema,
});
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

/** `POST /auth/password-reset/confirm` request. */
export const passwordResetConfirmRequestSchema = z.object({
  email: emailAddressSchema,
  code: emailCodeSchema,
  password: passwordSchema,
});
export type PasswordResetConfirmRequest = z.infer<typeof passwordResetConfirmRequestSchema>;

/** `POST /auth/password/change` request. */
export const passwordChangeRequestSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});
export type PasswordChangeRequest = z.infer<typeof passwordChangeRequestSchema>;

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
