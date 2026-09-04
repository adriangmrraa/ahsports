# 05 · GAP ANALYSIS — Lo que falta vs el alcance del relevamiento

> Diferencias entre lo que pide `docs/relevamiento-operativo-adjuntos-y-costos.md` (en el directorio padre) y lo que el MVP entrega.
> Severidad: 🔴 ALTA (bloqueante) · 🟠 MEDIA (importante, no bloqueante) · 🟡 BAJA (mejora).

## A. Alcance del MVP (relevamiento §1)

El MVP debe permitir:
- ✅ Dar de alta contacto y organización → **F3-01..F3-04** (cubierto en fase)
- ✅ Crear pedido con productos, talles, cantidades y personalizaciones → **F3-05..F3-12**
- ✅ Cargar y clasificar archivos → **F4-02..F4-04**
- ✅ Asociar archivo a ubicación/técnica → **F4-05..F4-06**
- ✅ Reutilizar escudo/logo aprobado entre pedidos → **F4-04** (biblioteca org)
- ⚠ Cotización trazable desde configuración vigente → **F3-15..F3-17** (cubierto pero la "fotografía" del cálculo exige snapshot, implementado en F2-09 con `orders.snapshot jsonb`)
- ✅ Estimar metros/kilos de tela y otros insumos por pedido → motor pricing.ts + bomItems (F2-15)
- ⚠ Registrar seña, bloquear inicio de producción → **F5-04..F5-05** (bloqueo automático + banner)
- ✅ Seguir avance del taller → **F3-13..F3-14** (Kanban)

## B. Gaps por severidad

### 🔴 ALTA

| ID | Gap | Estado | Mitigación / fase |
|----|-----|--------|-------------------|
| G1 | **Storage real de adjuntos** | Definido contrato, no implementado | F4-01 propone URL+metadata+base64. Para producción real: integrar S3/Cloudflare R2. **Pos-MVP** |
| G2 | **Notificaciones email/WhatsApp al cliente** | No en alcance MVP | Roadmap §08 |
| G3 | **Importación CSV de planillas** | No implementado | F6+ (mejora) |

### 🟠 MEDIA

| ID | Gap | Estado | Mitigación / fase |
|----|-----|--------|-------------------|
| G4 | **Edición 2D / mockup visual** | Explícitamente fuera del MVP (§1 relevamiento) | Roadmap §08 |
| G5 | **Generación automática de arte final** | Explícitamente fuera del MVP | Roadmap §08 |
| G6 | **Inventario completo por lote** | Explícitamente fuera del MVP | Roadmap §08 |
| G7 | **Bot de WhatsApp autónomo** | Explícitamente fuera del MVP | Roadmap §08 |
| G8 | **Multi-tenant / multi-taller** | Asumimos **un solo taller** (AH Sports). No hay FK `tenant_id` en el schema. | Si en el futuro se quisiera multi-taller, habría que agregar `tenant_id` en TODAS las tablas + RLS. ADR-08 |
| G9 | **Reportes de margen real vs costo estimado** | Parcial: `marginPercent` en pedido. Sin histórico de márgenes reales vs proyectados | Roadmap §08 |
| G10 | **Audit log de mutaciones sensibles** | `productionEvents` solo para cambios de stage. Cambios de precios/reglas NO auditados | F6+ (mejora) |
| G11 | **Versionado de recetas** | `bom_recipes` no tiene `version` ni histórico. Cambiar receta pisa la anterior | F6+ (mejora: agregar `version` + `previousVersionId`) |

### 🟡 BAJA

| ID | Gap | Estado |
|----|-----|--------|
| G12 | i18n (es/en) | No en alcance MVP |
| G13 | Temas light/dark toggle | Asumimos siempre dark (Kinetic Industrial). Light mode requeriría redefinir tokens |
| G14 | Exportación PDF de presupuestos | No en MVP |
| G15 | Integración con WhatsApp Business API | Roadmap §08 |

## C. Decisiones tomadas vs relevamiento

| Decisión | Razón |
|----|----|
| **No multi-tenant** | El taller es uno solo. AGENTS.md lo confirma. Si en el futuro se quisiera multi-taller, hay que rediseñar (Drizzle schema con `tenantId` en todas las tablas). |
| **Snapshot en `orders.snapshot jsonb`** | §4.7 del relevamiento pide "fotografía de cálculo". Implementado como `jsonb` inmutable. Re-cotizar genera snapshot nuevo (no histórico automático, eso es F6+). |
| **Sin hard-delete** | Todo borrado es soft-delete (`active=false` o `status=archivado/cancelled`). Preserva histórico. |
| **Mobile-first solo en ficha técnica operario** | Resto del admin es desktop-first (mismo patrón que Stitch). El presupuesto público SÍ es responsive (5 pasos × 2 variantes Stitch). |
| **Auth scrypt en vez de NextAuth/Clerk** | Solo 4 roles fijos. Cookie firmada es suficiente y más simple. |

## D. Cobertura por dominio del relevamiento

| Dominio (§) | Cobertura MVP |
|--------------|---------------|
| §1 Resultado MVP | ✅ Cubierto (con G1 como mitigación parcial) |
| §2 Lenguaje del dominio | ✅ Cubierto en `04-BUSINESS-RULES.md` §1 |
| §3 Gestión de adjuntos | ✅ Cubierto (F4) |
| §4 Configuración técnica y económica | ✅ Cubierto (F2) |
| §5 Flujo integrado del pedido | ✅ Cubierto (F3 + F4) |
| §6 Preguntas a la gerente | n/a — input humano |
| §7 Plan de implementación por etapas | ✅ F0 (validación) → F1 (fundación) → F2 (núcleo) → F3 (clientes+pedidos+producción) → F4 (adjuntos+presupuesto público) → F5 (caja+pagos+deploy). Cubre hasta Etapa 2 del relevamiento |
| §8 Criterios de aceptación | ✅ Cubiertos en F0-08 |