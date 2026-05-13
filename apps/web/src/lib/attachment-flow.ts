'use client';

import sodium from 'libsodium-wrappers-sumo';
import { api } from './api';
import { ensureCryptoReady, fromBase64, toBase64, randomBytes } from './crypto-client';
import { useAppStore } from '@/store/useAppStore';
import type { UserPublic } from '@cifra/shared';

const FILE_KEY_BYTES = 32;

export interface UploadResult {
  storageKey: string;
  wrappedKey: string;
  wrappedKeyNonce: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Cifra el archivo con una fileKey random, sube ciphertext a MinIO via
 * presigned URL, devuelve metadata para registrar en el server.
 */
export async function encryptAndUploadAttachment(
  file: File,
  recipient: UserPublic
): Promise<UploadResult> {
  await ensureCryptoReady();
  const { identityKeys } = useAppStore.getState();
  if (!identityKeys) throw new Error('Not authenticated');

  const plaintext = new Uint8Array(await file.arrayBuffer());
  const fileKey = randomBytes(FILE_KEY_BYTES);
  const stream = sodium.crypto_secretstream_xchacha20poly1305_init_push(fileKey);
  const body = sodium.crypto_secretstream_xchacha20poly1305_push(
    stream.state,
    plaintext,
    null,
    sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
  );
  const ciphertext = new Uint8Array(stream.header.length + body.length);
  ciphertext.set(stream.header, 0);
  ciphertext.set(body, stream.header.length);

  const nonce = randomBytes(sodium.crypto_box_NONCEBYTES);
  const wrappedKey = sodium.crypto_box_easy(
    fileKey,
    nonce,
    fromBase64(recipient.identityPub),
    identityKeys.identity.privateKey
  );
  sodium.memzero(fileKey);
  sodium.memzero(plaintext);

  const presign = await api<{
    url: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
  }>('/attachments/upload-url', {
    method: 'POST',
    body: { mimeType: file.type || 'application/octet-stream', sizeBytes: ciphertext.length },
  });

  const uploadRes = await fetch(presign.url, {
    method: 'PUT',
    body: ciphertext,
    headers: { 'content-type': 'application/octet-stream' },
  });
  if (!uploadRes.ok) {
    throw new Error(`Upload failed: ${uploadRes.status}`);
  }

  return {
    storageKey: presign.storageKey,
    wrappedKey: toBase64(wrappedKey),
    wrappedKeyNonce: toBase64(nonce),
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: ciphertext.length,
  };
}

export async function fetchAndDecryptAttachment(
  attachmentId: string,
  sender: UserPublic
): Promise<{ blobUrl: string; mimeType: string; revoke: () => void }> {
  await ensureCryptoReady();
  const { identityKeys } = useAppStore.getState();
  if (!identityKeys) throw new Error('Not authenticated');

  const meta = await api<{
    url: string;
    mimeType: string;
    sizeBytes: number;
    wrappedKey: string;
    wrappedKeyNonce: string;
  }>(`/attachments/${attachmentId}/download-url`);

  const fileRes = await fetch(meta.url);
  if (!fileRes.ok) throw new Error('Download failed');
  const ciphertext = new Uint8Array(await fileRes.arrayBuffer());

  const wrapped = fromBase64(meta.wrappedKey);
  const nonce = fromBase64(meta.wrappedKeyNonce);
  const fileKey = sodium.crypto_box_open_easy(
    wrapped,
    nonce,
    fromBase64(sender.identityPub),
    identityKeys.identity.privateKey
  );
  if (!fileKey || fileKey.length !== FILE_KEY_BYTES) {
    throw new Error('Could not unwrap attachment key');
  }

  const headerLen = sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES;
  if (ciphertext.length < headerLen) throw new Error('Attachment too short');
  const header = ciphertext.slice(0, headerLen);
  const body = ciphertext.slice(headerLen);

  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, fileKey);
  const result = sodium.crypto_secretstream_xchacha20poly1305_pull(state, body, null);
  sodium.memzero(fileKey);
  if (!result) throw new Error('Decrypt failed');

  const blob = new Blob([result.message], { type: meta.mimeType });
  const blobUrl = URL.createObjectURL(blob);
  return {
    blobUrl,
    mimeType: meta.mimeType,
    revoke: () => URL.revokeObjectURL(blobUrl),
  };
}

export async function requestSaveAttachment(attachmentId: string): Promise<void> {
  await api('/save-requests', { method: 'POST', body: { attachmentId } });
}

export async function resolveSaveRequest(requestId: string, approve: boolean): Promise<void> {
  await api('/save-requests/resolve', { method: 'POST', body: { requestId, approve } });
}
