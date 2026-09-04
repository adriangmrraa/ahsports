# AH Sports OS — Documentación

Documentación estructurada del proyecto **AH Sports OS**. Cada archivo cubre un aspecto del sistema.

## Índice

| # | Archivo | Tema |
|---|---------|------|
| 00 | [`README.md`](./00-README.md) | Este índice |
| 01 | [`01-PARITY-INVENTORY.md`](./01-PARITY-INVENTORY.md) | Mapeo 37 pantallas Stitch → rutas destino + entidades |
| 02 | [`02-ARCHITECTURE.md`](./02-ARCHITECTURE.md) | Arquitectura modular, capas, stack, decisiones |
| 03 | [`03-API-ROUTES.md`](./03-API-ROUTES.md) | Inventario completo de rutas HTTP y server actions |
| 04 | [`04-BUSINESS-RULES.md`](./04-BUSINESS-RULES.md) | Lenguaje del dominio, fórmulas de cotización, máquina de estados |
| 05 | [`05-GAP-ANALYSIS.md`](./05-GAP-ANALYSIS.md) | Lo que falta vs el alcance del relevamiento, con severidad |
| 06 | [`06-STANDARDS-BUILDING.md`](./06-STANDARDS-BUILDING.md) | Reglas de código, estilo, naming, convenciones |
| 07 | [`07-DEPLOYMENT.md`](./07-DEPLOYMENT.md) | Deploy en Render + Neon, env vars, primer arranque |
| 08 | [`08-ROADMAP.md`](./08-ROADMAP.md) | Roadmap post-MVP: WhatsApp bot, mockup 2D, inventario real |

## Estado del proyecto

- **Fase actual**: F5 (Caja + Pagos + Deploy)
- **Build progress**: ver `BUILD_PROGRESS.md` (índice) + `BUILD_PROGRESS-F<N>.md` (fases individuales)
- **Pendientes post-MVP**: ver `../PENDIENTES.md`

## Resumen ejecutivo

AH Sports OS digitaliza el ciclo operativo del taller:

1. **Cliente** pide presupuesto desde la web → recorre 5 pasos (datos → producto/talles → personalizaciones → archivos → confirmación)
2. **Admin** recibe el pedido, lo cotiza contra recetas+BOM, bloquea si la seña no alcanza, asigna a producción
3. **Operario** consulta la ficha técnica móvil con la planilla y materiales requeridos, avanza etapas
4. **Caja** registra seña y pagos, libera el bloqueo, cierra la cuenta corriente

Stack unificado: Next.js 15 + Drizzle ORM + Neon Postgres + Tailwind v4 + Lucide. Design system "Kinetic Industrial" (cyan+amber+violet sobre midnight).