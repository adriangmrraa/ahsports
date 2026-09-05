# ✅ AH Sports OS — BUILD_PROGRESS (Checklist de Construcción)

> **FUENTE DE VERDAD del estado de construcción** del proyecto **AH Sports OS** — sistema operativo del taller de indumentaria deportiva AH Sports (Formosa, Argentina).
> Estructurado igual que **Saas Fusa Labs** y **Dentalogic**: **un archivo checkpoint por fase** (`BUILD_PROGRESS-F<N>.md`) para que cada sesión/agente edite/verifique sin condición de carrera.
>
> ⚠️ ¡NO edites este índice para marcar tareas! Usá `BUILD_PROGRESS-F<N>.md` de la fase activa.

---

## Estado global

- **Proyecto**: AH Sports OS — plataforma operativa del taller (pedidos, producción, cotización, adjuntos, caja)
- **Destino**: `C:\Users\Asus\Documents\estabilizacion\ah sports\App de gestion`
- **Stack**: Next.js 15 App Router + TS strict + Tailwind v4 + Drizzle ORM + Neon (Postgres serverless) + Lucide React + Zod + auth cookie firmada con scrypt (sin NextAuth, sin Supabase)
- **Design system base**: **Kinetic Industrial** (proveniente de Stitch — cyan primario, amber highlight, violet producción, sobre midnight)
- **Deploy target**: Render (Web Service + Neon Postgres)
- **Fase actual**: F5 (config + deploy) en curso — 6/16 (pagos F5-03..06 ✅ + caja F5-01/02 ✅). F4 ✅ completa 22/22 @2026-09-05. Restan 10 tareas.
- **IMPORTANTE para el próximo agente**: NO asumir que el código actual compila ni corre. Hay issues conocidos en F1 que requieren fix antes de empezar F2 — ver `KNOWN-ISSUES.md`. Antes de empezar a construir, leer `docs/02-ARCHITECTURE.md` §4 (decisiones D1..D7) y `docs/06-STANDARDS-BUILDING.md` para mantener consistencia.

---

## Reglas OBLIGATORIAS de construcción (heredadas)

| Regla | Detalle |
|-------|---------|
| **Arquitectura modular** | `src/modules/<dominio>` autocontenido (components/, api/, schemas/, lib/). Un dev entra solo a `/modules/{dominio}` y entiende. Kebab-case carpetas, PascalCase componentes, camelCase funciones. |
| **Stack UNIFICADO** | Next.js 15 + TS strict + Drizzle + Neon + Tailwind v4 + Lucide. **NUNCA** Supabase, **NUNCA** NextAuth, **NUNCA** colors hardcoded — CSS vars semánticas (`bg-surface`, `text-on-surface`, etc.). |
| **Iconos** | SOLO Lucide React. NUNCA Material Symbols ni FontAwesome. |
| **Server components** | Por defecto; `'use client'` solo con state/events/effects (Kanban, Forms interactivos). |
| **Componentes** | Named exports · Pages default exports · Mocks prefijo `mock` · Types en `types/index.ts` |
| **DB única fuente de verdad** | **Ningún precio crítico en el código.** Materiales, técnicas, márgenes y reglas viven en DB. Cada cotización guarda **snapshot** en `orders.snapshot`. |
| **Auth simple** | Cookie de sesión firmada con scrypt. Roles: `admin`, `gerencia`, `disenador`, `operario`. Hash: scrypt con salt. |
| **Costos trazables** | Toda cotización queda con `snapshot` que guarda materiales+técnica+regla+momento. Cambios futuros NO alteran pedidos viejos. |
| **Commits** | Conventional, sin atribución IA. |

---

## Material origen analizado (F0)

| Origen | Cantidad | Detalle |
|--------|----------|---------|
| Pantallas Stitch (HTML estático) | **37 prototipos** | dashboard, kanban, ficha pedido admin, planilla prendas, ficha técnica operario (móvil), revisión de arte, catálogo + detalle producto (desktop+móvil), config talles/moldes, recetas/BOM, gestión insumos, caja+saldos, caja+pagos, clientes CRM, perfil org 360, seguimiento pedido (desktop+móvil), presupuesto público 5 pasos (×3 variantes desktop/móvil), landing, logo |
| Design system | 1 | `kinetic_industrial/DESIGN.md` (paleta Midnight+cyan+amber+violet, tipografía Space Grotesk+Inter, layout sidebar 280px, glass-panel, tech-grid-bg, gradient-text) |
| Auditorías de cobertura | 3 | `auditor_a_de_cobertura_ah_sports.md` (v1, v2, v3) — mapeo pantalla → flujo funcional |
| Documento de dominio | 1 | `docs/relevamiento-operativo-adjuntos-y-costos.md` (378 líneas: lenguaje, adjuntos, BOM, recetas, fórmulas, plan por etapas, criterios de aceptación) |

**Mapeo Stitch → rutas destino** (ver `docs/03-API-ROUTES.md`):

| Pantalla Stitch | Ruta destino |
|---|---|
| landing_page | `/` |
| solicitud_presupuesto paso 1..5 | `/presupuesto/[step]` (5 pasos) |
| seguimiento_pedido (desktop+móvil) | `/seguimiento/[token]` |
| login | `/login` |
| panel_administrativo_dashboard | `/admin` |
| pedidos (lista) | `/admin/pedidos` |
| kanban_de_produccion | `/admin/pedidos/kanban` |
| ficha_de_pedido_admin | `/admin/pedidos/[id]` |
| planilla_individual_de_prendas | `/admin/pedidos/[id]/planilla` |
| planilla_detalle_tecnico | `/admin/pedidos/[id]/planilla/[itemId]` |
| ficha_tecnica_operario (móvil) | `/admin/pedidos/[id]/ficha-tecnica` |
| ficha_pedido_bloqueado_por_seña | `/admin/pedidos/[id]` (banner) + `/admin/pedidos/bloqueados` |
| revision_de_arte | `/admin/pedidos/[id]/arte` |
| catalogo_de_productos | `/admin/productos` |
| detalle_de_producto (desktop+móvil) | `/admin/productos/[id]` |
| configuracion_de_talles_y_moldes | `/admin/productos/[id]/talles` |
| configuracion_de_recetas_tecnicas_bom | `/admin/recetas` + `/admin/productos/[id]/recetas` |
| gestion_de_materiales_e_insumos | `/admin/insumos` |
| caja_y_saldos | `/admin/caja` |
| caja_y_gestion_de_pagos | `/admin/pagos` + `/admin/pedidos/[id]/pagos` |
| clientes_y_leads_crm | `/admin/organizaciones` |
| perfil_de_organizacion_vista_360 | `/admin/organizaciones/[id]` |
| configuracion_general | `/admin/configuracion` |

---

## Índice de fases (archivos BUILD_PROGRESS-F<N>.md)

| Archivo | Fase | Tareas | Completadas | Estado |
|---------|------|--------|-------------|--------|
| `BUILD_PROGRESS-F0.md` | F0 — Audit del material Stitch + análisis del dominio | 8 | 8 | ✅ **COMPLETO** (F0 finalizada) |
| `BUILD_PROGRESS-F1.md` | F1 — Fundación (Next.js + Drizzle + Neon + Auth + Design system) | 14 | 14 | ✅ **COMPLETO** (F1 finalizada — scaffold + UI primitives + schema base) |
| `BUILD_PROGRESS-F2.md` | F2 — Núcleo operativo (Productos + Insumos + Técnicas + Recetas + Talles + Pricing rules) | 22 | 22 | ✅ **COMPLETO** @2026-09-04 (todos los grupos con typecheck+build+e2e vs Neon) |
| `BUILD_PROGRESS-F3.md` | F3 — Clientes + Pedidos + Planilla + Kanban producción + Motor cotización | 26 | 26 | ✅ **COMPLETO** @2026-09-04 |
| `BUILD_PROGRESS-F4.md` | F4 — Adjuntos + Arte + Aplicaciones + Presupuesto público (5 pasos) + Seguimiento | 22 | 22 | ✅ **COMPLETO** @2026-09-05 (E2E vs Neon + cierre) |
| `BUILD_PROGRESS-F5.md` | F5 — Caja + Pagos + Configuración + Render deploy + Cierre | 16 | 6 | 🟢 **EN CURSO** (pagos+caja ✓ — siguiente: F5-07/08 config) |
| **TOTAL** | — | **108** | **98** | F0 (8) + F1 (14) + F2 (22) + F3 (26) + F4 (22) + F5 (6) completas. Restan 10 (F5). |

---

## Progreso consolidado

| Fase | Archivo | Completadas |
|------|---------|-------------|
| F0 | `BUILD_PROGRESS-F0.md` | 8/8 |
| F1 | `BUILD_PROGRESS-F1.md` | 14/14 |
| F2 | `BUILD_PROGRESS-F2.md` | 22/22 |
| F3 | `BUILD_PROGRESS-F3.md` | 26/26 |
| F4 | `BUILD_PROGRESS-F4.md` | 22/22 |
| F5 | `BUILD_PROGRESS-F5.md` | 4/16 |

---

## Cómo avanzar (protocolo sesión)

1. Leé este índice → entrá al `BUILD_PROGRESS-F<N>.md` de la fase activa.
2. Primera línea `- [ ]` → tu única tarea del turno.
3. Verificá en `docs/` (arquitectura, schema, business-rules) + Stitch/screens relevantes antes de implementar.
4. Implementá + verificá con `tsc --noEmit` + `next build` + dev server real (no inventes).
5. Marcá `- [ ]` → `- [x]` + `@fecha-YYYY-MM-DD` + breve VERIFICADO con qué se testeó.
6. Guardá observación en Engram (`project: ah-sports`).
7. Reportá: (1) HICE [ID+verif], (2) QUEDA [fase+N], (3) SIGUIENTE [ID+doc].