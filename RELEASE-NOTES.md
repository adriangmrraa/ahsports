# RELEASE NOTES — AH Sports OS (MVP v1.0)

> **Fecha**: 2026-09-06 · **Estado**: ✅ MVP production-ready (108/108 tareas, F0–F5)
> **Stack**: Next.js 15 (App Router) · TypeScript strict · Drizzle ORM · Neon (Postgres serverless) · Tailwind v4 · Lucide · Zod · auth cookie firmada (scrypt + HMAC)

## Qué incluye

| Área | Features |
|------|----------|
| **Público** | Landing · Presupuesto público 5 pasos · Seguimiento de pedido por token |
| **Auth** | Login con rate limiting (5/min/IP) · Sesión firmada · Roles (admin/gerencia/disenador/operario) · **Sin credenciales demo** |
| **Catálogo** | Productos con talles y moldes · Insumos (soft-delete) · Técnicas · Recetas BOM con zonas |
| **Pedidos** | Alta de pedido · Líneas y prendas · Planilla individual · Ficha técnica operario · Kanban de producción · Motor de cotización con snapshot (costo/precio/margen) · Bloqueo por seña |
| **Adjuntos** | Upload con sesiones expirantes · Arte por adjunto · Aplicaciones sobre arte |
| **Clientes** | Organizaciones + contactos CRM · Perfil 360 con adjuntos |
| **Finanzas** | Pagos por pedido (seña/pago/saldo, cancelables con auditoría) · Caja con saldos y cuenta corriente por organización · Recálculo automático de bloqueo |
| **Configuración** | Reglas de pricing (margen, urgencia, seña mínima, redondeo) · Datos del taller · Hub con snapshots de cotización |
| **Seguridad** | Headers + CSP (F5-14) · Rate limit login (F5-15) · Migraciones idempotentes |
| **Deploy** | `render.yaml` declarativo · Dockerfile multi-stage · Build prod + smoke test verificados |

## Seguridad de accesos (importante)

- **No existen credenciales demo ni formulario de login con datos precargados.**
- El usuario admin se crea en el seed con la password de la variable `ADMIN_PASSWORD` (mín. 8 caracteres). No hay default.
- En producción la password del admin fue rotada (ver historial de sesión): `admin1234` **ya no es válida**.

## Cómo retomar el desarrollo

1. `npm install` · `.env` con `DATABASE_URL` + `SESSION_SECRET` (ver `AGENTS.md`)
2. `npm run typecheck`
3. Proyecto **completo** → cualquier feature nueva entra como `BUILD_PROGRESS-F6.md` (ver `PENDIENTES.md` para backlog priorizado)

## Diferido para F6+

Storage real de adjuntos (S3/R2) · Email/WhatsApp · Bot WhatsApp · Mockup 2D · Inventario por lote · Reportes margen real · Audit log · Multi-tenant · Export PDF/CSV · Mercado Pago · i18n · Tema light.