# 01 · PARITY INVENTORY — Stitch → AH Sports OS

> Mapeo 1:1 de las **37 pantallas Stitch** a rutas reales del destino, con entidades involucradas.
> Stitch = prototipos HTML estáticos del design system "Kinetic Industrial". No es código.

## 1. Stitch design system

| Origen | Archivo | Uso en destino |
|--------|---------|----------------|
| `kinetic_industrial/DESIGN.md` | Design tokens, paleta, tipografía, layouts | `src/app/globals.css` (Tailwind v4 `@theme` + utilidades `glass-panel`, `gradient-text`, `label-caps`, `data-mono`, `tech-grid-bg`) + Google Fonts (Space Grotesk + Inter) |

## 2. Tabla maestra Stitch → rutas

| # | Pantalla Stitch | Tipo | Ruta destino | Entidades | Notas |
|---|----------------|------|--------------|-----------|-------|
| 1 | `landing_page` | desktop | `/` | — | Landing pública con CTA a presupuesto |
| 2 | `solicitud_presupuesto_paso_1_desktop_1` | desktop | `/presupuesto/1` | contacts, organizations | Paso 1: tipo cliente + datos |
| 3 | `solicitud_presupuesto_paso_1_desktop_2` | desktop | `/presupuesto/1` | contacts, organizations | Variante con org existente |
| 4 | `solicitud_presupuesto_paso_1_mobile` | mobile | `/presupuesto/1` | contacts, organizations | Mismo flujo responsive |
| 5 | `solicitud_presupuesto_paso_2_talles_y_cantidades_desktop` | desktop | `/presupuesto/2` | products, sizes, orderLines | Selección producto + talles + cant |
| 6 | `solicitud_presupuesto_paso_2_talles_y_cantidades_mobile` | mobile | `/presupuesto/2` | products, sizes | responsive |
| 7 | `solicitud_presupuesto_paso_3_personalizacion_desktop_1/2` | desktop | `/presupuesto/3` | orderItems | Nombre/número por prenda |
| 8 | `solicitud_presupuesto_paso_3_personalizacion_mobile` | mobile | `/presupuesto/3` | orderItems | responsive |
| 9 | `solicitud_presupuesto_paso_4_carga_de_archivos_desktop_1/2` | desktop | `/presupuesto/4` | attachments | Upload escudo/sponsors/planilla |
| 10 | `solicitud_presupuesto_paso_4_carga_de_archivos_mobile` | mobile | `/presupuesto/4` | attachments | responsive |
| 11 | `solicitud_presupuesto_paso_5_confirmacion_desktop` | desktop | `/presupuesto/5` | orders, snapshot | Confirmación + preview |
| 12 | `solicitud_presupuesto_paso_5_confirmacion_mobile` | mobile | `/presupuesto/5` | orders | responsive |
| 13 | `seguimiento_de_pedido_desktop` | desktop | `/seguimiento/[token]` | orders, attachments | Tracking público por token |
| 14 | `seguimiento_de_pedido_mobile` | mobile | `/seguimiento/[token]` | orders | responsive |
| 15 | `login` (no Stitch, derivado) | — | `/login` | users | Login con scrypt+cookie |
| 16 | `panel_administrativo_dashboard` | desktop | `/admin` | orders, payments (KPIs) | Dashboard con embudo producción |
| 17 | `panel_administrativo_dashboard` (sub: pedidos) | desktop | `/admin/pedidos` | orders | Lista + filtros estado |
| 18 | `kanban_de_produccion` | desktop | `/admin/pedidos/kanban` | orders, productionEvents | Drag-drop entre etapas |
| 19 | `ficha_de_pedido_admin` | desktop | `/admin/pedidos/[id]` | orders, orderLines, payments, attachments | Vista 360 del pedido |
| 20 | `ficha_de_pedido_bloqueado_por_se_na` | desktop | `/admin/pedidos/[id]` + banner | orders | Banner + tab `/admin/pedidos/bloqueados` |
| 21 | `planilla_individual_de_prendas` | desktop | `/admin/pedidos/[id]/planilla` | orderItems | Planilla editable inline |
| 22 | `planilla_de_prendas_detalle_tecnico` | desktop | `/admin/pedidos/[id]/planilla/[itemId]` | orderItems, applications | Detalle técnico por prenda |
| 23 | `ficha_tecnica_operario_mobile` | mobile | `/admin/pedidos/[id]/ficha-tecnica` | orderItems, materials | Vista mobile-first operario |
| 24 | `revision_de_arte` | desktop | `/admin/pedidos/[id]/arte` | attachments, applications | Aprobar/rechazar/reemplazar |
| 25 | `catalogo_de_productos` | desktop | `/admin/productos` | products | Lista con SKU + precio + zonas |
| 26 | `detalle_de_producto_desktop` | desktop | `/admin/productos/[id]` | products, sizes, bomRecipes | Vista detalle con sub-secciones |
| 27 | `detalle_de_producto_mobile` | mobile | `/admin/productos/[id]` | products | responsive |
| 28 | `configuracion_de_talles_y_moldes` | desktop | `/admin/productos/[id]/talles` | sizes | Editor inline de talles |
| 29 | `configuracion_de_recetas_tecnicas_bom` | desktop | `/admin/recetas` + `/admin/productos/[id]/recetas` | bomRecipes, bomItems, materials, techniques | BOM + técnica |
| 30 | `gestion_de_materiales_e_insumos` | desktop | `/admin/insumos` | materials | CRUD completo de materiales |
| 31 | `caja_y_saldos` | desktop | `/admin/caja` | payments, orders | Saldos por organización |
| 32 | `caja_y_gestion_de_pagos` | desktop | `/admin/pagos` + `/admin/pedidos/[id]/pagos` | payments | Alta/listado de pagos |
| 33 | `clientes_y_leads_crm` | desktop | `/admin/organizaciones` | organizations, contacts | CRM ligero |
| 34 | `perfil_de_organizacion_vista_360` | desktop | `/admin/organizaciones/[id]` | organizations, contacts, orders, attachments | Vista 360 |
| 35 | `configuracion_general` | desktop | `/admin/configuracion` | pricingRules, settings | Reglas + datos del taller |
| 36 | `arte_global` (derivado de tab lateral) | desktop | `/admin/arte` | attachments | Listado global adjuntos |
| 37 | `logo` | asset | favicon + brand | — | Solo referencia visual |

## 3. Auditorías de cobertura (origen)

- `stitch_ah_sports_os/auditor_a_de_cobertura_ah_sports.md` (v1)
- `stitch_ah_sports_os/auditor_a_de_cobertura_v2_ah_sports.md`
- `stitch_ah_sports_os/auditor_a_de_cobertura_v3_ah_sports.md`

Las tres coinciden en mapear pantalla→función. La tabla §2 consolida las 37 con su estado final (todo mapeado).

## 4. Decisiones de simplificación

| Decisión | Justificación |
|----------|---------------|
| Una sola ruta por paso del presupuesto (no `?variant=`) | Las variantes desktop/móvil de Stitch son la MISMA pantalla en distintos breakpoints. Tailwind `md:` las cubre. |
| `revision_de_arte` no es tab separado, vive dentro de la ficha del pedido | Stitch lo muestra como sub-pantalla; arquitectónicamente pertenece al pedido. |
| `kanban_de_produccion` vive bajo `/admin/pedidos/kanban` (no top-level) | Es una vista de pedidos, no un dominio separado. |