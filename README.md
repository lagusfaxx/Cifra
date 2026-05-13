# Cifra

Mensajería cifrada de extremo a extremo para ejecutivos, alcaldes, asesores y profesionales que manejan información sensible en Chile/LATAM.

**No compite con WhatsApp.** Es un canal seguro paralelo para conversaciones críticas.

## Garantías

- Cifrado E2E con `libsodium` (NaCl: X25519, Ed25519, XChaCha20-Poly1305).
- Registro sin teléfono, sin nombre real, sin RUT, sin tracking.
- El servidor **nunca** ve plaintext, PINs, private keys, ni emails en claro.
- Mensajes con TTL configurable. Borrado inmediato en delivery+read.
- Recuperación con frase BIP39 de 24 palabras (cliente-side).

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | Next.js 14 (App Router) + Tailwind + shadcn/ui |
| API | Express + Socket.io |
| Crypto | libsodium-wrappers-sumo, argon2, @scure/bip39, @simplewebauthn |
| DB | PostgreSQL 16 + Prisma |
| Cache | Redis 7 |
| Storage | MinIO (S3-compatible) |
| Deploy | Coolify + Traefik + Cloudflare |

## Estructura del repo

```
cifra/
├── apps/
│   ├── web/       Next.js 14 (frontend cifrado client-side)
│   └── api/       Express API (server-side stateless)
├── packages/
│   ├── crypto/    Primitivas E2E (compartido entre web y api)
│   └── shared/    Tipos + zod schemas
├── docker-compose.yml
└── docs/
    ├── ARCHITECTURE.md
    ├── SECURITY.md
    └── DEPLOY.md
```

## Quickstart (desarrollo local)

Requisitos: Node 20+, pnpm 9+, Docker.

```bash
# 1. clonar e instalar
pnpm install

# 2. copiar el archivo de entorno
cp .env.example .env
# generá los secrets:
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)" >> .env
echo "EMAIL_HASH_SALT=$(openssl rand -hex 32)" >> .env
echo "USERNAME_HASH_SALT=$(openssl rand -hex 32)" >> .env

# 3. levantar infraestructura local (postgres + redis + minio + mailhog)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis minio mailhog

# 4. correr migraciones
pnpm db:migrate:dev

# 5. correr api y web en watch
pnpm dev
```

- API: `http://localhost:4000`
- Web: `http://localhost:3000`
- MailHog UI: `http://localhost:8025`
- MinIO console: `http://localhost:9001`

## Tests

```bash
pnpm test                          # todos los packages
pnpm --filter @cifra/crypto test   # solo crypto
```

## Deploy a Coolify

Ver [`docs/DEPLOY.md`](docs/DEPLOY.md). Resumen:

1. En Coolify, "New Resource → Docker Compose".
2. Apuntar al repo + branch.
3. Definir dominios (`cifra.app` para web, `api.cifra.app` para api).
4. Coolify inyecta `SERVICE_FQDN_WEB` y `SERVICE_FQDN_API`.
5. Setear secrets en Coolify (todos los `JWT_*`, `*_PASSWORD`, `*_HASH_SALT`, SMTP).
6. Deploy. Las migraciones corren automáticamente en el entrypoint del api.

## Seguridad

Ver [`docs/SECURITY.md`](docs/SECURITY.md) para el threat model completo y decisiones criptográficas.

Reportar vulnerabilidades responsablemente: ver el archivo `SECURITY.md`.

## Licencia

Privado. Sin licencia pública.
