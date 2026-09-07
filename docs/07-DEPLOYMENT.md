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
3. **Build Command**:
   ```
   npm install && npm run db:push && npm run build
   ```
   - `db:push` aplica el schema Drizzle directamente (sin migraciones). Aceptable para MVP.
   - Si se prefiere migraciones versionadas: usar `npm run db:migrate` (requiere migraciones generadas con `db:generate`).
4. **Start Command**: `npm start`
5. **Instance Type**: Free o Starter ($7/mes para mejor performance)

### Variables de entorno en Render

| Key | Value | Notas |
|-----|-------|-------|
| `DATABASE_URL` | (pegar de Neon) | **Secret** |
| `SESSION_SECRET` | random 32+ chars | Generar con `openssl rand -base64 32` |
| `NODE_ENV` | `production` | Auto-set por Render |

### Build filters (opcional)

- Excluir `docs/`, `*.md`, `BUILD_PROGRESS*` del deploy para acelerar (no crítico)

## 4. Primer deploy

1. Push a `main` (o la branch que Render esté mirando)
2. Render hace build automático
3. Si falla: revisar logs (panel de Render)
4. Una vez vivo: `https://ah-sports-os.onrender.com/` debería responder 200

## 5. Seed inicial (una sola vez)

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

## 6. Custom domain (opcional)

Render → Settings → Custom Domain → `app.ahsports.com.ar`

Agregar CNAME en el DNS del dominio:
- `app` CNAME → `ah-sports-os.onrender.com`

## 7. Monitoreo mínimo

- **Logs**: Render → Logs (stdout). En MVP alcanza.
- **Uptime**: Render tiene health check automático en `/`.
- **DB metrics**: Neon dashboard muestra CPU, storage, queries lentas.

## 8. Backups

Neon hace PITR (Point-in-Time Recovery) hasta 7 días en tier gratuito. Para producción real considerar tier Pro.

## 9. Troubleshooting

| Síntoma | Causa probable | Fix |
|---------|----------------|-----|
| Build falla en `db:push` | `DATABASE_URL` no seteada o mal | Verificar env vars en Render |
| Build falla en `npm install` | Versión Node incompatible | Fijar Node 22 en `.nvmrc` o `package.json` engines |
| Runtime: "cookies blocked" | Cookie `secure` en dev HTTP | Aceptable en prod (HTTPS). En dev usar `http://localhost` |
| Login no funciona | `SESSION_SECRET` cambió entre deploys | Fijar valor estable en env vars |
| 500 al cargar dashboard | DB no migrada | Re-correr `npm run db:push` en build command |
| Queries lentas | DB en region lejana | Elegir region Neon cercana a Render (US East) |

## 10. CI/CD

- Push a `main` → Render redeploy automático
- PR branches → Render crea preview deploy (plan de pago)
- Para evitar redeploys innecesarios: agregar `docs/**` al `.renderignore`

## 11. Post-MVP checklist

- [ ] Configurar logs estructurados (Pino o similar)
- [ ] Configurar monitoring (Sentry, LogRocket, o PostHog)
- [ ] Configurar backups automatizados fuera de Neon (snapshot diario a S3)
- [ ] SSL personalizado (ya provisto por Render)
- [ ] Rate limiting en `/api/auth/login` (F5-15)