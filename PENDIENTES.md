# PENDIENTES — AH Sports OS

> Lista viva de cosas que quedaron pendientes al cierre del MVP (F5). Incluye cosas explícitamente fuera del MVP y cosas que se priorizaron por debajo del cut-off.

## Estado al cierre

- ✅ F0 (Audit) + F1 (Fundación) + F2 (Núcleo) + F3 (Pedidos) + F4 (Adjuntos + Presupuesto público) + F5 (Caja + Pagos + Deploy)

## Diferido explícitamente (fuera de MVP — ver `docs/05-GAP-ANALYSIS.md`)

| Item | Severidad | Razón |
|------|-----------|-------|
| Storage real de adjuntos (S3 / R2 / disco prod) | 🔴 | Definimos contrato URL+metadata, falta integración real. Para dev alcanza data-URL. Para prod: F6+ |
| Notificaciones email/WhatsApp al cliente | 🟠 | Roadmap §08 |
| Edición 2D / mockup visual | 🟠 | Explícitamente fuera del MVP (§1 relevamiento) |
| Generación automática de arte final | 🟠 | Idem |
| Inventario completo por lote | 🟠 | Idem |
| Bot de WhatsApp autónomo | 🟠 | Idem |
| Multi-tenant | 🟠 | Asumimos un solo taller (ADR-08) |
| Reportes margen real vs estimado | 🟠 | Solo margen proyectado al cotizar |
| Audit log de mutaciones sensibles | 🟠 | Solo productionEvents |
| Versionado de recetas | 🟡 | Cambiar receta pisa la anterior |
| Importación CSV planillas | 🟡 | No en MVP |
| Exportación PDF presupuestos | 🟡 | No en MVP |
| i18n | 🟡 | Solo es-AR |
| Tema light | 🟡 | Asumimos dark (Kinetic Industrial) |
| App móvil nativa | 🟡 | Web responsive alcanza |
| Mercado Pago para señas | 🟡 | Roadmap §08 |

## Pasos para terminar al 100%

Si querés terminar TODO lo marcado como pendiente:

1. **Storage real**: integrar `@aws-sdk/client-s3` o `@cloudflare/r2` + crear bucket + middleware `multipart/form-data` que suba y devuelva URL. ~2-3 días
2. **Email transaccional**: Resend + plantillas para "presupuesto recibido", "seña confirmada", "pedido entregado". ~1 día
3. **WhatsApp entrante**: webhook + parser + persistencia en `chat_messages` (tabla nueva). ~1 semana
4. **WhatsApp bot**: integración con API conversacional (Mastra AI o similar). ~2 semanas
5. **Mockup 2D**: SVG por producto + Canvas API + drag/drop de adjuntos sobre zonas. ~2 semanas
6. **Inventario**: tabla nueva `inventory_lots` + decremento automático en paso a `corte` + UI de stock. ~1 semana
7. **Reportes margen real**: endpoint de carga de costo real + dashboard comparativo. ~3 días
8. **Audit log**: tabla `audit_events` + middleware/triggers en mutaciones sensibles. ~3 días
9. **Versionado de recetas**: agregar `version` + `previousVersionId`, snapshot de BOM al cotizar. ~2 días
10. **Multi-tenant**: refactor completo del schema (19 tablas + auth). ~2-3 semanas (rompe compat)

## Cómo retomar

1. Abrir `BUILD_PROGRESS.md` → revisar fase activa
2. Si todo F0-F5 está completo: el proyecto está production-ready, no necesita retomar
3. Si querés agregar features de backlog: crear nueva fase en `BUILD_PROGRESS-F6.md` y granularizar

## Soporte / contacto

- Repo: este directorio
- Neon project: el configurado en env vars de Render
- Render service: el configurado en env vars