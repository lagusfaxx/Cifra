# Modelo de seguridad de Cifra

## Threat model

### Adversarios considerados

| Adversario | Capacidad | Mitigación |
| --- | --- | --- |
| **Atacante de red pasivo** (ISP, sniffer Wi-Fi) | Lee tráfico en claro | TLS 1.3 + HSTS + Cloudflare. Aunque TLS caiga, todo el contenido va cifrado E2E. |
| **Atacante de red activo** (MITM) | Modifica tráfico | TLS + AEAD signed messages. Tampering rompe Ed25519 signature → mensaje rechazado. |
| **Server comprometido** (db dump) | Lee toda la DB | Server solo tiene: ciphertext, hashes, pubkeys, encPrivBlob cifrado con KEK derivado del PIN. Sin PIN no se descifra nada. |
| **Subpoena al server** | Forzar entrega de datos | Solo se pueden entregar: hashes de username/email (no reversibles), ciphertext (opaco), encPrivBlob (sin PIN, inútil). |
| **Attacker con device del usuario** | Acceso físico | Requiere PIN. 4 intentos fallidos → bloqueo 15min. Vault chats con PIN extra. |
| **Phishing / replay** | Engañar al cliente | Origin binding en WebAuthn, CSP estricta, no `unsafe-inline`. |

### NO mitigados explícitamente

- **Screenshots en cliente web**: imposible de prevenir en navegador. Comunicado en onboarding.
- **Keyloggers en el device del user**: out of scope. El user debe usar un device confiable.
- **Compromiso de TODO el device** (malware con acceso a memoria): out of scope.
- **Side-channels** (timing, cache): mitigado parcialmente con `sodium.memcmp` y `argon2id`.

## Decisiones criptográficas

### Por qué libsodium-wrappers-sumo (no `crypto.subtle`)

- `crypto.subtle` no expone primitivas modernas como `XChaCha20-Poly1305`,
  `Ed25519` consistentemente, ni `crypto_secretstream`.
- libsodium es auditado, constant-time donde corresponde, y tiene API uniforme
  entre Node y browser (vía WASM).

### Por qué `sumo` y no la build slim

`sumo` incluye `crypto_pwhash` (argon2id), `crypto_secretstream`, y otras
primitivas que la build slim omite.

### Por qué X25519 + Ed25519 separados (no un solo Ed25519 multi-uso)

- Las pubkeys se rotan por separado en v2 (Double Ratchet rota X25519 cada
  mensaje pero mantiene la identidad Ed25519).
- Evita reusar la misma key para dos propósitos (anti-patrón clásico).

### Por qué XChaCha20-Poly1305 (no AES-GCM)

- Nonce de 192 bits → seguro generarlos aleatoriamente sin contador.
- Implementación constante en tiempo sin necesidad de AES-NI (móviles).
- AEAD nativo (Poly1305 tag) protege integridad.

### Argon2id parameters

- `OPSLIMIT_MODERATE`, `MEMLIMIT_MODERATE`, `ALG_ARGON2ID13`.
- ~250ms en CPU de gama media. Suficientemente lento para frenar brute-force
  offline, tolerable en login interactivo.

### KEK vs Verifier — salts distintos a propósito

Si el server fuera comprometido y un atacante tomara `(verifierSalt, pinVerifier)`,
ese par solo sirve para verificar PINs candidatos contra el server (lo cual está
rate-limited). **No puede derivar el KEK** porque el KEK usa otro salt. Es decir,
el brute-force offline contra `encPrivBlob` requiere el `pinSalt` (no expuesto
en el flujo de login) Y `encPrivBlob` (sí expuesto), pero argon2id MODERATE
hace que cada intento cueste ~250ms × memoria.

### HKDF binding al conversationId

`msgKey = HKDF(shared, salt="cifra-msg-v1", info="conv:<id>")` evita que un
mensaje cifrado para conversación A se pueda descifrar como si fuera de B, aun
si el atacante reordena ciphertext. Esto da un grado de domain separation barato.

## Anti-fuerza-bruta del PIN

Tracking por `usernameHash` y por IP, lo que sea más restrictivo:

| Intentos fallidos | Ventana | Bloqueo |
| --- | --- | --- |
| 4 | 10 min | 15 min |
| 10 | 1 h | 24 h |
| 20 | 24 h | Cuenta marcada — requiere recovery con frase BIP39 |

Los PINs intentados **nunca** se loguean. Solo el resultado (success/fail) y el
contexto (hash de username, hash de IP).

## Datos que el server NUNCA almacena

- Email en claro
- Teléfono (nunca pedido)
- Nombre real, RUT, dirección
- Contenido de mensajes (solo ciphertext)
- Private keys (cifradas con KEK)
- Frase BIP39 (solo cliente)
- Contactos del usuario
- Logs con datos personales (pino con redacción)

IPs del registro se borran a las 24h via cron.

## Datos que sí se almacenan

- `hash(username, salt_global)` único
- `hash(email + salt_global)` único — solo para evitar duplicados
- Public keys (X25519 identity, Ed25519 signing)
- `encPrivBlob` (privkeys cifradas con KEK)
- `pinSalt`, `verifierSalt`, `pinVerifier`
- Public keys de passkeys
- Timestamps mínimos

## Identidad pública

Lo único que otros usuarios ven:

1. `@username` (3-20 chars, `^[a-z0-9_]+$`)
2. Display name (≤ 30 chars, editable, puede ser ficticio)
3. Avatar opcional (cifrado con key derivada de la conversación)

**No** se expone: email, fecha registro, IP, devices, métricas, lastSeen.

## Descubrimiento de contactos

Solo tres formas, ninguna basada en agenda telefónica:

1. **Username exacto**: typing manual.
2. **QR code**: muestra `{username, identityPub, signature}` firmado. Verificación
   en persona implica safety number ya match.
3. **Link de invitación efímero**: token de 32 chars, válido 24h, un solo uso.

No existe búsqueda por nombre, ni "personas que tal vez conozcas".

## Reportar vulnerabilidades

Si encontrás un problema, por favor **no** lo publiques. Contactá privadamente
al equipo de seguridad. Detalles en el `SECURITY.md` del repo cuando esté público.
