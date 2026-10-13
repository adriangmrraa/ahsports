# AH Sports OS

> **ESTADO REAL**: **F0–F5 completas** (108/108) y **desplegado**, más la **plataforma de agentes IA** (canales Telegram interno + WhatsApp/YCloud de ventas) ya mergeada en `master`. El aviso viejo de "solo F0+F1" ya no aplica. Ver `BUILD_PROGRESS.md` para el detalle por fase y `KNOWN-ISSUES.md` para issues abiertos (KI-07 fuentes, KI-13 lint toolchain). Los canales del agente están implementados y verificados **estáticamente**; la validación en vivo con proveedores reales todavía no se ejecutó — ver [`docs/10-AGENT-CHANNELS-GUIDE.md`](docs/10-AGENT-CHANNELS-GUIDE.md).

Sistema operativo del taller **AH Sports**. Next.js 15 + Neon (Postgres serverless) + Drizzle ORM + Tailwind v4.

Stack unificado con FusaLabs / AdminYa / Dentalogic:
- Next.js App Router + Server Actions
- Drizzle ORM sobre `@neondatabase/serverless` (HTTP driver, ideal para serverless en Render)
- Tailwind v4 con design system **Kinetic Industrial** (cyan primario, amber highlight, violet producción, sobre midnight)
- Lucide React para iconos
- Zod para validación
- Auth simple cookie-based con sesión firmada (sin dependencias externas)

## Quick start

```bash
npm install
cp .env.example .env   # setear DATABASE_URL de Neon + SESSION_SECRET + SECRET_ENCRYPTION_KEY
npm run db:migrate     # aplica las migraciones versionadas (idempotente; NO db:push)
$env:ADMIN_PASSWORD='clave-segura'   # password del admin (la define el taller)
npm run db:seed        # datos demo (admin + productos + organización)
npm run dev            # http://localhost:3000
```

> ⚠️ **No existen credenciales demo.** El seed crea el admin con la password de la variable `ADMIN_PASSWORD` (mín. 8 caracteres, sin default). No hay formulario "demo" en el login.
>
> Sobre una DB con datos usá **siempre** `npm run db:migrate` (migraciones idempotentes), nunca `db:push`.

## Agente IA (Telegram + WhatsApp)

Guía completa de operación de los canales del agente —setup, webhooks, permisos, pruebas y rollback— en **[`docs/10-AGENT-CHANNELS-GUIDE.md`](docs/10-AGENT-CHANNELS-GUIDE.md)**.

## Deploy en Render

1. Crear Web Service apuntando a este repo (o usar `render.yaml` incluido — es la fuente autoritativa)
2. Build command (según `render.yaml`): `npm install && npm run db:migrate && npm run build`
3. Start command: `npm start`
4. Variables de entorno:
   - `DATABASE_URL` (Neon connection string)
   - `SESSION_SECRET` (32+ chars random, **fijo**: si cambia entre deploys, todas las sesiones se invalidan)
   - `SECRET_ENCRYPTION_KEY` (32+ chars random, **fijo**: cifra en reposo los secretos del agente)
   - `ADMIN_PASSWORD` (usa solo para el seed: `npm run db:seed` con `ADMIN_PASSWORD` set, una sola vez)
   - Las específicas de los canales del agente (`WHATSAPP_*`, `YCLOUD_*`, `AGENT_AI_*`, `CRON_SECRET`) están documentadas por nombre en [`docs/10-AGENT-CHANNELS-GUIDE.md`](docs/10-AGENT-CHANNELS-GUIDE.md) y [`docs/07-DEPLOYMENT.md`](docs/07-DEPLOYMENT.md).
5. Primer deploy → la URL pública del servicio responde 200

### Troubleshooting

- **Build falla en `db:migrate`**: `DATABASE_URL` mal o ausente → verificar env vars en Render y que apunte al proyecto correcto de Neon.
- **Login falla tras un deploy**: `SESSION_SECRET` cambió → fijar valor estable.
- **Login rechaza credenciales validadas en dev**: el hash se genera con la password de `ADMIN_PASSWORD` al seedar; repetir seed con la misma password.
- **500 al cargar dashboard**: schema no aplicado → re-correr `npm run db:migrate`.

`render.yaml` incluido para deploy declarativo.

## Estructura

```
src/
  app/
    (public)/              # presupuesto público, seguimiento, login
    (admin)/               # panel interno con sidebar
    api/                   # auth, uploads, etc.
  components/
    ui/                    # Button, Input, Card, Badge, DataTable
    layout/                # Sidebar, TopBar, Shell
  db/
    schema.ts              # schema Drizzle completo
    client.ts              # neon HTTP client
    seed.ts                # datos demo
  lib/
    auth.ts                # sesión cookie firmada
    pricing.ts             # motor de cotización (costo + precio + materiales)
    utils.ts               # cn(), formatCurrency, etc.
```

## Mapeo Stitch → Rutas

| Pantalla Stitch                                  | Ruta real                                    |
|--------------------------------------------------|----------------------------------------------|
| Landing                                           | `/`                                          |
| Solicitud presupuesto paso 1..5                  | `/presupuesto/[step]`                        |
| Seguimiento pedido                                | `/seguimiento/[orderNumber]`                 |
| Login                                             | `/login`                                     |
| Dashboard                                         | `/admin`                                     |
| Pedidos / Kanban producción                      | `/admin/pedidos`, `/admin/pedidos/kanban`    |
| Ficha de pedido admin                             | `/admin/pedidos/[id]`                        |
| Planilla individual / detalle                    | `/admin/pedidos/[id]/planilla`               |
| Ficha técnica operario (móvil)                   | `/admin/pedidos/[id]/ficha-tecnica`          |
| Revisión de arte                                  | `/admin/pedidos/[id]/arte`                   |
| Catálogo de productos                             | `/admin/productos`                           |
| Detalle de producto                               | `/admin/productos/[id]`                      |
| Configuración de talles y moldes                  | `/admin/productos/[id]/talles`               |
| Recetas técnicas (BOM)                            | `/admin/recetas`                             |
| Materiales e insumos                              | `/admin/insumos`                             |
| Caja y saldos                                     | `/admin/caja`                                |
| Caja y gestión de pagos                           | `/admin/pagos`                               |
| Clientes y leads CRM                              | `/admin/organizaciones`                      |
| Perfil de organización                            | `/admin/organizaciones/[id]`                 |
| Configuración general                             | `/admin/configuracion`                       |

Ver `PENDIENTES.md` para lo que falta terminar al 100%.