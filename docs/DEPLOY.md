# Deploy a Coolify

Cifra está pensado para correr en una sola instancia de Coolify con Traefik
delante y TLS via Cloudflare/Let's Encrypt.

## Prerrequisitos

- Una instancia de Coolify >= 4.0 funcionando.
- Dominios apuntando a la IP de Coolify (recomendado vía Cloudflare):
  - `cifra.app` para el frontend
  - `api.cifra.app` para la API
- SMTP funcional para envío de códigos de verificación (Postmark, SES, Resend, etc.).

## Setup paso a paso

### 1. Crear recurso

En Coolify: **New Resource → Public Repository → Docker Compose**.

- Repository URL: tu fork/clon de Cifra
- Branch: `main`
- Build pack: Docker Compose
- Docker Compose location: `/docker-compose.yml`

### 2. Configurar servicios públicos

Coolify detecta automáticamente los servicios con `expose:`. Configurá:

| Servicio | Dominio | Puerto |
| --- | --- | --- |
| `web` | `https://cifra.app` | 3000 |
| `api` | `https://api.cifra.app` | 4000 |

Coolify inyectará `SERVICE_FQDN_WEB=cifra.app` y `SERVICE_FQDN_API=api.cifra.app`
automáticamente.

### 3. Generar y setear secrets

En la pestaña de **Environment Variables**, pegá lo siguiente. Generá los hex
con `openssl rand -hex 32` localmente:

```bash
POSTGRES_USER=cifra
POSTGRES_PASSWORD=<openssl rand -hex 24>
POSTGRES_DB=cifra

REDIS_PASSWORD=<openssl rand -hex 24>

MINIO_ROOT_USER=cifra
MINIO_ROOT_PASSWORD=<openssl rand -hex 24>
MINIO_BUCKET=cifra-attachments

JWT_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>

EMAIL_HASH_SALT=<openssl rand -hex 32>
USERNAME_HASH_SALT=<openssl rand -hex 32>

SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=<tu user>
SMTP_PASS=<tu pass>
SMTP_FROM="Cifra <noreply@cifra.app>"

LOG_LEVEL=info
```

**No olvides marcarlos como secretos en Coolify.** Una vez rotados, no se
pueden recuperar — la app dejará de funcionar correctamente porque los hashes
de username/email cambian.

### 4. Volúmenes persistentes

El `docker-compose.yml` declara tres volúmenes que Coolify monta automáticamente:

- `postgres_data` → `/var/lib/postgresql/data`
- `redis_data` → `/data`
- `minio_data` → `/data` (dentro del container de minio)

**Hacé backups regulares de `postgres_data` y `minio_data`.** Sin ellos no se
puede recuperar el servicio.

### 5. Primer deploy

Coolify hace `docker compose up -d --build`. En el primer deploy:

1. `postgres`, `redis`, `minio` levantan primero (healthchecks).
2. `api` corre `prisma migrate deploy` via `docker-entrypoint.sh`, después levanta el server.
3. `web` levanta una vez que `api` está healthy.

### 6. Acceso a MinIO console

MinIO console está en el puerto 9001 pero **no se expone públicamente** en el
`docker-compose.yml`. Si necesitás acceder:

```bash
ssh -L 9001:localhost:9001 user@coolify-host
# después abrí http://localhost:9001 en el navegador local
```

Y configurá lifecycle rules para auto-borrado de attachments expirados como
backup del cron del api.

## Verificación post-deploy

```bash
curl https://api.cifra.app/health
# → {"ok":true,"service":"cifra-api"}

curl https://api.cifra.app/health/deep
# → {"ok":true,"checks":{"db":true,"redis":true}}

curl https://cifra.app/api/health
# → {"ok":true,"service":"cifra-web"}
```

## Rotación de secrets

| Secret | Rotable | Cómo |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | Sí, con maintenance | Update Coolify + restart |
| `REDIS_PASSWORD` | Sí, con maintenance | Update Coolify + restart |
| `JWT_SECRET` | Sí | Invalida todas las sesiones activas |
| `JWT_REFRESH_SECRET` | Sí | Invalida todos los refresh tokens |
| `EMAIL_HASH_SALT` | **NO** | Rompe todos los hashes de email existentes |
| `USERNAME_HASH_SALT` | **NO** | Rompe todos los hashes de username existentes |
| `MINIO_ROOT_PASSWORD` | Sí, con maintenance | Coordinar con MinIO admin |

Los hash salts se setean una sola vez al inicio del proyecto. Si se necesitan
rotar (compromiso), hay que diseñar una migración de hashes.

## Logs

`pino` envía a stdout en JSON. Coolify los muestra en la pestaña de **Logs**.
La redacción de campos sensibles está configurada en `apps/api/src/lib/logger.ts`.

## Troubleshooting

**`prisma migrate deploy` falla**: revisar que `DATABASE_URL` apunte al servicio
`postgres` interno (no a localhost), y que `postgres_data` tenga permisos.

**Web no se conecta al api**: confirmar que `NEXT_PUBLIC_API_URL` está seteado
al deploy time del web (es un build arg, no runtime).

**Healthcheck de api falla en deploy inicial**: aumentar `start_period` en el
docker-compose si la DB tarda más en levantar.
