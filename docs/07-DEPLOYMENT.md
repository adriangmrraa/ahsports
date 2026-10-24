# 07 · DEPLOYMENT — Render + Neon

> Paso a paso para llevar AH Sports OS a producción en Render con Neon como DB.

## 1. Prerrequisitos

- Cuenta en [Neon](https://neon.tech) (tier gratuito alcanza para MVP)
- Cuenta en [Render](https://render.com) (tier gratuito o starter)
- Repo Git (GitHub/GitLab) con este código

## 2. Crear DB en Neon

1. New Project → "AH Sports OS" → region US East (Ohio) o São Paulo
2. Copiar la **Connection string** (con `?sslmode=require`)
   - Formato: `postgresql://USER:PASSWORD@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`
3. (Opcional) Branch `production` separada de `main` para mayor隔离

## 3. Crear Web Service en Render

1. New + → Web Service → conectar repo
2. **Runtime**: Node
3. **Build Command** (idéntico a `render.yaml`, la fuente autoritativa):
   ```
   npm install && npm run db:migrate && npm run build
   ```
   - `db:migrate` aplica las migraciones versionadas de `src/db/migrations/` (idempotentes, seguras de re-ejecutar).
   - **No usar `db:push`** en una DB con datos: `db:push` sincroniza el schema directamente sin historial y puede descartar cambios.
4. **Start Command**: `npm start`
5. **Instance Type**: Free o Starter ($7/mes para mejor performance)

### Variables de entorno en Render

Base (obligatorias):

| Key | Value | Notas |
|-----|-------|-------|
| `DATABASE_URL` | (pegar de Neon) | **Secret** |
| `SESSION_SECRET` | random 32+ chars | Fijo entre deploys; generarlo con `openssl rand -base64 32` |
| `SECRET_ENCRYPTION_KEY` | random 32+ chars | **Secret** y **fijo**: clave AES-256-GCM que cifra en reposo los secretos del agente. Si cambia, los secretos cifrados existentes dejan de descifrarse |
| `NODE_ENV` | `production` | Auto-set por Render |

Canales del agente IA (opcionales; por nombre, nunca valores acá):

| Key | Para qué |
|-----|----------|
| `AGENT_AI_API_KEY` / `AGENT_AI_BASE_URL` / `AGENT_AI_ENDPOINT_URL` / `AGENT_AI_ENDPOINT_PATH` | Runtime IA del agente (genéricos) |
| `AGENT_AI_<PROVIDER>_API_KEY` / `_BASE_URL` / `_ENDPOINT_URL` | Overrides por proveedor (`<PROVIDER>` en MAYÚSCULAS, no alfanuméricos → `_`) |
| `WHATSAPP_APP_SECRET` | Firma del webhook de WhatsApp (`X-Hub-Signature-256`) |
| `WHATSAPP_VERIFY_TOKEN` | Handshake de verificación de Meta |
| `YCLOUD_API_KEY` | Envío saliente por YCloud (`X-API-Key`) |
| `WHATSAPP_PHONE_NUMBER` | Número emisor en YCloud |
| `YCLOUD_BASE_URL` | Base URL de YCloud (default `https://api.ycloud.com`) |
| `CRON_SECRET` | Autenticación del disparador del cron de reconciliación (fallback `AGENT_CRON_SECRET`) |

> ⚠️ **Gap conocido:** `CRON_SECRET` / `AGENT_CRON_SECRET` se leen directo con
> `process.env` en la ruta de reconciliación y **no** están en `.env.example` ni en
> `src/lib/env.ts`. Si usás el cron, cargala en Render; conviene agregarla a
> `.env.example` en un cambio de código aparte.

### Storage de archivos

El filesystem de Render es **efímero** — cualquier archivo en disco muere en
cada redeploy. `STORAGE_PROVIDER` elige dónde viven los bytes (adjuntos de
pedidos/productos y media entrante de clientes):

| Modo | Config | Dónde quedan los bytes |
|------|--------|------------------------|
| `db` (recomendado en Render) | `STORAGE_PROVIDER=db` | Tabla `stored_files` (bytea) en Neon — sobrevive redeploys. Se sirven por `/api/files/*` (público) y `/api/media/*` (session-gated). Sin dependencias externas |
| `local` (default) | `STORAGE_PROVIDER=local` + `UPLOADS_DIR`/`MEDIA_UPLOADS_DIR` opcionales | Disco. Default `public/uploads` (estático `/uploads/*`) y `private/uploads` |

Opción con disco persistente de Render (si se monta un Disk):

```
STORAGE_PROVIDER=local
UPLOADS_DIR=/var/data/uploads
MEDIA_UPLOADS_DIR=/var/data/media
```

Con `UPLOADS_DIR` fuera de `public/` los adjuntos públicos se sirven por
`/api/files/*` (los URLs `/uploads/*` solo existen bajo `public/`).

Notas:
- La migración `0025_stored_files` crea la tabla (idempotente, corre con
  `npm run db:migrate` en el build).
- Adjuntos subidos antes de este cambio con URLs `/uploads/...` no resuelven
  en modo `db` — los bytes ya no existen en el disco efímero viejo.
- Tope por archivo: 5MB adjuntos públicos, 25MB media entrante.

> 📖 **Guía completa de los canales** (setup, webhooks, operadores, permisos, pruebas,
> rollback y notas de privacidad): [`10-AGENT-CHANNELS-GUIDE.md`](./10-AGENT-CHANNELS-GUIDE.md).

### Build filters (opcional)

- Excluir `docs/`, `*.md`, `BUILD_PROGRESS*` del deploy para acelerar (no crítico)

## 4. Primer deploy

1. Push a `main` (o la branch que Render esté mirando)
2. Render hace build automático
3. Si falla: revisar logs (panel de Render)
4. Una vez vivo: la URL pública del servicio (`https://<tu-dominio-publico>/`) debería responder 200

## 5. Cron Job de reconciliación (Render)

El endpoint `POST /api/cron/reconcile` **no se agenda solo**. Sin un Cron Job, el
reconcile de candidatos nunca corre.

1. Render → **New +** → **Cron Job**
2. Conectar el mismo repo; **Runtime**: Node (igual que el Web Service)
3. **Build Command**: `npm install` (el job solo necesita Node)
4. **Schedule**: `*/15 * * * *` (cada 15 min). El lock del runner (TTL 15 min)
   evita solapamientos dentro de esa ventana: una invocación concurrente
   responde `already_running`; un lock vencido por una corrida caída se
   reclama en la siguiente invocación.
5. **Command** (Node 22, sin depender de `curl`):
   ```bash
   node -e "fetch('https://<tu-dominio-publico>/api/cron/reconcile',{method:'POST',headers:{Authorization:'Bearer '+process.env.CRON_SECRET}}).then(async r=>{console.log(r.status, await r.text());process.exit(r.ok?0:1)}).catch(e=>{console.error(e.message);process.exit(1)})"
   ```
6. Cargar `CRON_SECRET` también en las env vars del Cron Job (mismo valor que
   el Web Service). Si está vacío, la ruta falla cerrado con 401.
7. Variantes: agregar `?mode=sweep` (lookback 72h, hasta 20 conversaciones) y
   `&limit=N` (1..20) a la URL.

Respuestas: `200` con `status: completed | already_running | not_configured`;
`500` con `status: "failed"` cuando la corrida no escaneó ninguna conversación
(DB caída, scan roto), para que el scheduler pueda alertar.

## 6. Seed inicial (una sola vez)

Después del primer deploy:

1. Render → Shell → ejecutar:
   ```bash
   ADMIN_PASSWORD='clave-segura-del-taller' npm run db:seed
   ```
   (La password del admin se define con `ADMIN_PASSWORD`; **no hay credenciales default ni formulario demo**.)
2. Esto crea: admin user (`admin@ahsports.com`), organización demo, 5 materiales, 3 técnicas, 4 productos con talles y recetas
3. **No hay UI de cambio de password**: la del admin queda fijada por el seed (re-seedear con `ADMIN_PASSWORD` distinta la cambia).

Alternativa: ejecutar seed localmente apuntando a la DB de producción (con cuidado):
```bash
$env:ADMIN_PASSWORD='clave-segura-del-taller'; DATABASE_URL=postgresql://... npm run db:seed
```

## 7. Custom domain (opcional)

Render → Settings → Custom Domain → `app.ahsports.com.ar`

Agregar CNAME en el DNS del dominio:
- `app` CNAME → `ah-sports-os.onrender.com`

## 8. Monitoreo mínimo

- **Logs**: Render → Logs (stdout). En MVP alcanza.
- **Uptime**: Render tiene health check automático en `/`.
- **DB metrics**: Neon dashboard muestra CPU, storage, queries lentas.

## 9. Backups

Neon hace PITR (Point-in-Time Recovery) hasta 7 días en tier gratuito. Para producción real considerar tier Pro.

## 10. Troubleshooting

| Síntoma | Causa probable | Fix |
|---------|----------------|-----|
| Build falla en `db:migrate` | `DATABASE_URL` no seteada o mal | Verificar env vars en Render |
| Build falla en `npm install` | Versión Node incompatible | Fijar Node 22 en `.nvmrc` o `package.json` engines |
| Runtime: "cookies blocked" | Cookie `secure` en dev HTTP | Aceptable en prod (HTTPS). En dev usar `http://localhost` |
| Login no funciona | `SESSION_SECRET` cambió entre deploys | Fijar valor estable en env vars |
| 500 al cargar dashboard | DB no migrada | Re-correr `npm run db:migrate` en build command |
| Queries lentas | DB en region lejana | Elegir region Neon cercana a Render (US East) |

## 11. CI/CD

- Push a `main` → Render redeploy automático
- PR branches → Render crea preview deploy (plan de pago)
- Para evitar redeploys innecesarios: agregar `docs/**` al `.renderignore`

## 12. Post-MVP checklist

- [ ] Configurar logs estructurados (Pino o similar)
- [ ] Configurar monitoring (Sentry, LogRocket, o PostHog)
- [ ] Configurar backups automatizados fuera de Neon (snapshot diario a S3)
- [ ] SSL personalizado (ya provisto por Render)
- [ ] Rate limiting en `/api/auth/login` (F5-15)