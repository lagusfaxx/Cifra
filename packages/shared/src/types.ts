export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface SignupInitResponse {
  verificationToken: string;
  expiresAt: number;
}

export interface SignupVerifyResponse {
  verificationToken: string;
  expiresAt: number;
}

export interface SignupCompleteResponse {
  userId: string;
  tokens: AuthTokens;
}

export interface LoginInitResponse {
  verifierSalt: string;
  pinSalt: string;
  challenge: string;
}

export interface LoginVerifyResponse {
  tokens: AuthTokens;
  encPrivBlob: string;
  encPrivNonce: string;
  hasPasskey: boolean;
}

export interface RecoverInitResponse {
  challenge: string;
  signingPub: string;
}

export interface RecoverCompleteResponse {
  tokens: AuthTokens;
  userId: string;
}

export interface PendingMessageDTO {
  id: string;
  senderUsername: string;
  senderSigningPub: string;
  ciphertext: string;
  nonce: string;
  ephemeralPub: string;
  signature: string;
  createdAt: string;
  expiresAt: string;
  hasAttachment: boolean;
}

export interface SocketEvents {
  'message:new': { id: string };
  'message:delivered': { id: string };
  'message:read': { id: string };
  'save-request:created': { requestId: string; attachmentId: string };
  'save-request:resolved': { requestId: string; approved: boolean };
}

export type TtlPreset = 5 * 60 | 60 * 60 | 24 * 60 * 60 | 7 * 24 * 60 * 60 | 30 * 24 * 60 * 60;
export const TTL_PRESETS: readonly TtlPreset[] = [
  5 * 60,
  60 * 60,
  24 * 60 * 60,
  7 * 24 * 60 * 60,
  30 * 24 * 60 * 60,
] as const;

export const TTL_DEFAULT = 24 * 60 * 60;

export interface InviteRedeemResponse {
  inviter: {
    username: string;
    displayName: string;
    identityPub: string;
    signingPub: string;
  };
}
