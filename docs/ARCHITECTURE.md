# Arquitectura de Cifra

## Vista general

```
                    ┌──────────────────────────┐
                    │   Cloudflare + Traefik   │
                    └────┬──────────────────┬──┘
                         │                  │
                    cifra.app          api.cifra.app
                         │                  │
                  ┌──────▼──────┐    ┌──────▼──────┐
                  │   web       │    │   api       │
                  │ Next.js 14  │    │ Express     │
                  │ (cripto en  │    │ (stateless, │
                  │  cliente)   │    │ ve ciphertext)
                  └─────────────┘    └──┬─────┬─────┬────┐
                                       │     │     │    │
                                  ┌────▼─┐ ┌─▼──┐ ┌▼───┐ ┌▼────┐
                                  │ pg   │ │redis│ │minio│ │smtp│
                                  └──────┘ └────┘ └────┘ └────┘
```

## Por qué `api` está separado de Next.js

- **Aislamiento de superficie de ataque**: el frontend de Next.js puede tener
  vulnerabilidades en SSR/server actions; tenerlo en otro proceso evita que
  un bug en una página de marketing comprometa la API.
- **Distintos perfiles de carga**: web sirve assets estáticos, api maneja
  websockets persistentes.
- **Escalabilidad**: podemos escalar api de forma independiente del frontend.

## Flujo de datos

Todo lo sensible se cifra en el cliente antes de tocar la red.

### Identity keys

1. Cliente genera 256 bits de entropía con `libsodium.randombytes_buf`.
2. Deriva keypair X25519 (encryption) y Ed25519 (signing) con `crypto_generichash`
   como KDF (`cifra-id-x25519-v1` / `cifra-id-ed25519-v1` como contexto).
3. La misma entropía se convierte en una frase BIP39 de 24 palabras (es/en).
4. KEK = `argon2id(PIN, pinSalt)`. `encPrivBlob = secretbox(serializedKeys, nonce, KEK)`.
5. Verifier separado: `argon2id(PIN, verifierSalt)`, otro salt — el server solo
   recibe el verifier, nunca el KEK ni el PIN.

### Mensaje (v1)

1. ECIES: ephemeral X25519 keypair por mensaje.
2. `shared = scalarmult(ephemeral.priv, recipient.identityPub)`.
3. `msgKey = HKDF-SHA256(shared, salt="cifra-msg-v1", info="conv:<id>")`.
4. AEAD: `XChaCha20-Poly1305` con nonce de 24 bytes.
5. Signature Ed25519 sobre `ciphertext || nonce || ephemeralPub`.
6. El server guarda `(ciphertext, nonce, ephemeralPub, signature, expiresAt)`.
   Nunca ve plaintext.

### Mensaje (v2 — roadmap)

Signal Protocol: Double Ratchet + X3DH + Sealed Sender. El código está
estructurado con interfaces (`packages/crypto/src/message.ts`) para hacer
el swap limpio.

## Almacenamiento

- **postgres**: usuarios (con hashes, no plaintext), mensajes (ciphertext),
  attachments metadata, refresh tokens hash.
- **redis**: rate limit buckets, login challenges, sesiones de socket TTLed.
- **minio**: ciphertext de attachments. Las keys de attachment están envueltas
  con `crypto_box` hacia la pubkey del recipient.

## Limpieza

- Cron cada 60s en api: `DELETE FROM "Message" WHERE "expiresAt" < NOW()`.
- Una vez `deliveredAt` Y `readAt` están set, el mensaje se borra inmediatamente.
- IP del registro se borra a las 24h via cron.
- Cliente al cerrar app: borra todos los caches, blobs, y zustand state.
