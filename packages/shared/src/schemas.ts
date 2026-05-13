import { z } from 'zod';

export const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;
export const PIN_REGEX = /^[0-9]{6,12}$/;

export const usernameSchema = z
  .string()
  .min(3)
  .max(20)
  .regex(USERNAME_REGEX, 'Username must be 3-20 chars: a-z, 0-9, _');

export const emailSchema = z
  .string()
  .email()
  .max(254)
  .transform(s => s.trim().toLowerCase());

export const pinSchema = z.string().regex(PIN_REGEX, 'PIN must be 6-12 digits');

export const base64Schema = z
  .string()
  .min(1)
  .max(8192)
  .regex(/^[A-Za-z0-9+/]+=*$/, 'Invalid base64');

export const displayNameSchema = z.string().min(1).max(30);

// ---------- Auth ----------

export const signupInitSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
});
export type SignupInitInput = z.infer<typeof signupInitSchema>;

export const signupVerifySchema = z.object({
  username: usernameSchema,
  code: z.string().regex(/^[0-9]{6}$/, 'Code must be 6 digits'),
});
export type SignupVerifyInput = z.infer<typeof signupVerifySchema>;

export const signupCompleteSchema = z.object({
  username: usernameSchema,
  verificationToken: z.string().min(20).max(200),
  identityPub: base64Schema,
  signingPub: base64Schema,
  encPrivBlob: base64Schema,
  encPrivNonce: base64Schema,
  pinSalt: base64Schema,
  verifierSalt: base64Schema,
  pinVerifier: base64Schema,
  displayName: displayNameSchema,
});
export type SignupCompleteInput = z.infer<typeof signupCompleteSchema>;

export const loginInitSchema = z.object({
  username: usernameSchema,
});
export type LoginInitInput = z.infer<typeof loginInitSchema>;

export const loginVerifySchema = z.object({
  username: usernameSchema,
  pinVerifier: base64Schema,
});
export type LoginVerifyInput = z.infer<typeof loginVerifySchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20).max(500),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const recoverInitSchema = z.object({
  username: usernameSchema,
});
export type RecoverInitInput = z.infer<typeof recoverInitSchema>;

export const recoverCompleteSchema = z.object({
  username: usernameSchema,
  challenge: base64Schema,
  signature: base64Schema,
  newEncPrivBlob: base64Schema,
  newEncPrivNonce: base64Schema,
  newPinSalt: base64Schema,
  newVerifierSalt: base64Schema,
  newPinVerifier: base64Schema,
});
export type RecoverCompleteInput = z.infer<typeof recoverCompleteSchema>;

// ---------- Users ----------

export const userPublicSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  identityPub: base64Schema,
  signingPub: base64Schema,
});
export type UserPublic = z.infer<typeof userPublicSchema>;

export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ---------- Messages ----------

export const sendMessageSchema = z.object({
  recipientUsername: usernameSchema,
  ciphertext: base64Schema,
  nonce: base64Schema,
  ephemeralPub: base64Schema,
  signature: base64Schema,
  ttlSeconds: z.number().int().min(60).max(60 * 60 * 24 * 30),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const messageReadSchema = z.object({
  messageId: z.string().min(1).max(40),
});
export type MessageReadInput = z.infer<typeof messageReadSchema>;

export const conversationTtlSchema = z.object({
  conversationId: z.string().min(1).max(40),
  defaultTtl: z.union([
    z.literal(5 * 60),
    z.literal(60 * 60),
    z.literal(24 * 60 * 60),
    z.literal(7 * 24 * 60 * 60),
    z.literal(30 * 24 * 60 * 60),
  ]),
});
export type ConversationTtlInput = z.infer<typeof conversationTtlSchema>;

// ---------- Attachments ----------

export const uploadUrlSchema = z.object({
  mimeType: z
    .string()
    .max(127)
    .regex(/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/, 'Invalid MIME type'),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
});
export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;

export const registerAttachmentSchema = z.object({
  storageKey: z.string().min(1).max(200),
  messageId: z.string().min(1).max(40),
  wrappedKey: base64Schema,
  wrappedKeyNonce: base64Schema,
  mimeType: z.string().min(3).max(127),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
});
export type RegisterAttachmentInput = z.infer<typeof registerAttachmentSchema>;

export const saveRequestCreateSchema = z.object({
  attachmentId: z.string().min(1).max(40),
});
export type SaveRequestCreateInput = z.infer<typeof saveRequestCreateSchema>;

export const saveRequestResolveSchema = z.object({
  requestId: z.string().min(1).max(40),
  approve: z.boolean(),
});
export type SaveRequestResolveInput = z.infer<typeof saveRequestResolveSchema>;

// ---------- Invites ----------

export const createInviteSchema = z.object({});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const redeemInviteSchema = z.object({
  token: z
    .string()
    .min(32)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, 'Invalid invite token'),
});
export type RedeemInviteInput = z.infer<typeof redeemInviteSchema>;

// ---------- Passkeys ----------

export const passkeyRegisterStartSchema = z.object({});
export type PasskeyRegisterStartInput = z.infer<typeof passkeyRegisterStartSchema>;

export const passkeyRegisterFinishSchema = z.object({
  attestationResponse: z.unknown(),
  deviceName: z.string().min(1).max(50).optional(),
});
export type PasskeyRegisterFinishInput = z.infer<typeof passkeyRegisterFinishSchema>;

export const passkeyAuthStartSchema = z.object({
  username: usernameSchema,
});
export type PasskeyAuthStartInput = z.infer<typeof passkeyAuthStartSchema>;

export const passkeyAuthFinishSchema = z.object({
  username: usernameSchema,
  assertionResponse: z.unknown(),
});
export type PasskeyAuthFinishInput = z.infer<typeof passkeyAuthFinishSchema>;
