# AH Sports OS

> **⚠️ ESTADO REAL (al 2026-09-03)**: Solo **F0 (audit) + F1 (fundación)** están completas. F2-F5 tienen 86 tareas pendientes con código NO escrito. Ver `BUILD_PROGRESS.md` para el estado real y `KNOWN-ISSUES.md` para bugs conocidos en el código actual.

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
cp .env.example .env   # setear DATABASE_URL de Neon
npm run db:push        # crea el schema en Neon
npm run db:seed        # datos demo (admin + productos + organización)
npm run dev            # http://localhost:3000
```

Login por defecto (seed):
- email: `admin@ahsports.com`
- password: `admin1234`

## Deploy en Render

1. Crear Web Service apuntando a este repo
2. Build command: `npm install && npm run db:push && npm run build`
3. Start command: `npm start`
4. Variables de entorno:
   - `DATABASE_URL` (Neon connection string)
   - `SESSION_SECRET` (32+ chars random)

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