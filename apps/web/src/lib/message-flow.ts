'use client';

import { api } from './api';
import { encryptMessage, decryptMessage, fromBase64, ensureCryptoReady } from './crypto-client';
import { useAppStore } from '@/store/useAppStore';
import { useContactsStore } from './contacts-store';
import { useMessagesStore, conversationKey } from './messages-store';
import { TTL_DEFAULT } from '@cifra/shared';
import type { PendingMessageDTO, UserPublic } from '@cifra/shared';

interface SendMessageResult {
  id: string;
  expiresAt: string;
}

export async function sendEncryptedMessage(
  contact: UserPublic,
  plaintext: string,
  ttlSeconds: number = TTL_DEFAULT
): Promise<void> {
  await ensureCryptoReady();
  const { identityKeys, username } = useAppStore.getState();
  if (!identityKeys || !username) throw new Error('Not authenticated');

  const recipientIdentityPub = fromBase64(contact.identityPub);
  const key = conversationKey(username, contact.username);

  const encrypted = encryptMessage({
    plaintext,
    recipientIdentityPub,
    senderSigningPriv: identityKeys.signing.privateKey,
    conversationId: key,
  });

  const res = await api<SendMessageResult>('/messages', {
    method: 'POST',
    body: {
      recipientUsername: contact.username,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      ephemeralPub: encrypted.ephemeralPub,
      signature: encrypted.signature,
      ttlSeconds,
    },
  });

  useMessagesStore.getState().add({
    id: res.id,
    conversationKey: key,
    direction: 'out',
    plaintext,
    createdAt: Date.now(),
    expiresAt: new Date(res.expiresAt).getTime(),
    read: false,
  });
}

export async function fetchAndDecryptPending(): Promise<void> {
  await ensureCryptoReady();
  const { identityKeys, username } = useAppStore.getState();
  if (!identityKeys || !username) return;

  const res = await api<{ messages: PendingMessageDTO[] }>('/messages/pending');
  for (const m of res.messages) {
    await processIncomingMessage(m);
  }
}

export async function processIncomingMessage(m: PendingMessageDTO): Promise<void> {
  await ensureCryptoReady();
  const { identityKeys, username } = useAppStore.getState();
  if (!identityKeys || !username) return;

  // Buscamos el contacto cuyo signingPub coincide. Si no está, no podemos
  // identificar el sender y descartamos (no agregamos automáticamente).
  const contact = findContactBySigningPub(m.senderSigningPub);
  if (!contact) {
    return;
  }

  const key = conversationKey(username, contact.username);
  try {
    const plaintext = decryptMessage({
      message: {
        ciphertext: m.ciphertext,
        nonce: m.nonce,
        ephemeralPub: m.ephemeralPub,
        signature: m.signature,
      },
      recipientIdentityPriv: identityKeys.identity.privateKey,
      senderSigningPub: fromBase64(m.senderSigningPub),
      conversationId: key,
    });

    useMessagesStore.getState().add({
      id: m.id,
      conversationKey: key,
      direction: 'in',
      plaintext,
      createdAt: new Date(m.createdAt).getTime(),
      expiresAt: new Date(m.expiresAt).getTime(),
      read: false,
    });
  } catch {
    // Mensaje corrupto, signature inválida, o no es para nosotros — ignoramos.
  }
}

function findContactBySigningPub(signingPubB64: string) {
  const contacts = useContactsStore.getState().byUsername;
  for (const c of contacts.values()) {
    if (c.signingPub === signingPubB64) return c;
  }
  return undefined;
}

export async function markRead(id: string): Promise<void> {
  await api(`/messages/${id}/read`, { method: 'PATCH' });
  useMessagesStore.getState().markRead(id);
}
