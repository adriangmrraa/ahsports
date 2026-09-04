# ✅ F0 — Audit del material Stitch + análisis del dominio (AH Sports OS)

> **Propósito**: levantar inventario completo del material Stitch (HTML estático + design system + docs de relevamiento) y mapear cada pantalla a una ruta real del destino, con sus entidades, antes de escribir código.
>
> Origen: `C:\Users\Asus\Documents\estabilizacion\ah sports\stitch_ah_sports_os\`
> Destino: `C:\Users\Asus\Documents\estabilizacion\ah sports\App de gestion`
> Referencia: `docs/01-PARITY-INVENTORY.md` (mapeo 1:1 Stitch → destino)

---

## A. Inventario Stitch

- [x] **F0-01** Listar las 37 pantallas Stitch con tipo (desktop/móvil), nombre legible y ruta destino propuesta. Ref: `Get-ChildItem stitch_ah_sports_os/`. **VERIFICADO 2026-09-02**: 37 directorios catalogados en `docs/01-PARITY-INVENTORY.md` §2 (tabla maestra). Cada carpeta contiene `code.html` + `screen.png`. Inventario cruzado contra `stitch/auditor_a_de_cobertura_v3_ah_sports.md` (cobertura por dominio) — coincide. @fecha-2026-09-02
- [x] **F0-02** Leer y consolidar `kinetic_industrial/DESIGN.md` (design system). Ref: design tokens, paleta, tipografía, layouts, elevación, formas, componentes. **VERIFICADO 2026-09-02**: design system cargado en `src/app/globals.css` (Tailwind v4 `@theme` con todas las CSS vars semánticas: surface, primary cyan, secondary amber, tertiary violet, error, outline-variant) + tipografía Space Grotesk/Inter vía Google Fonts. Glass-panel, gradient-text, tech-grid-bg, label-caps y data-mono como utilidades. Sidebar 280px. @fecha-2026-09-02
- [x] **F0-03** Leer y consolidar `docs/relevamiento-operativo-adjuntos-y-costos.md` (378 líneas). Ref: lenguaje del dominio, gestión adjuntos, BOM/recetas, fórmulas, criterios de aceptación. **VERIFICADO 2026-09-02**: lenguaje y fórmulas volcadas en `docs/04-BUSINESS-RULES.md` (vocabulario: organización, contacto, pedido, línea, prenda individual, activo gráfico, adjunto, ubicación, técnica, ficha técnica/receta). Fórmulas (consumo tela, conversión kilo, costo, precio) en `src/lib/pricing.ts` con signatura `quoteOrder()`. @fecha-2026-09-02

## B. Mapeo Stitch → rutas destino

- [x] **F0-04** Crear `docs/01-PARITY-INVENTORY.md` con tabla completa Stitch → ruta destino → entidades involucradas. Ref: 37 pantallas. **VERIFICADO 2026-09-02**: tabla maestra escrita con 37 entradas (Pantalla Stitch | Tipo | Ruta destino | Entidades | Estado). Incluye notas de variantes desktop/móvil. @fecha-2026-09-02
- [x] **F0-05** Identificar entidades del dominio y mapear a tablas DB. Ref: §2 del relevamiento (10 entidades) + §3 (adjuntos) + §4 (BOM). **VERIFICADO 2026-09-02**: 16 tablas definidas en `src/db/schema.ts` (users, sessions, organizations, contacts, materials, techniques, products, sizes, bomRecipes, bomItems, pricingRules, orders, orderLines, orderItems, attachments, applications, payments, productionEvents, settings) con enums (userRole, orderStatus, productionStage, paymentMethod, paymentKind, attachmentKind, attachmentStatus, applicationView, organizationKind, leadStatus, materialUnit). @fecha-2026-09-02

## C. Auditoría de gaps Stitch vs realidad

- [x] **F0-06** Listar gaps: lo que Stitch muestra pero NO está implementado como flujo real. Ref: 3 auditorías de cobertura. **VERIFICADO 2026-09-02**: gaps en `docs/05-GAP-ANALYSIS.md` con severidad. Críticos: (1) presupuesto público de 5 pasos (solo diseño, sin backend), (2) subida de adjuntos desde cliente (solo UI), (3) motor de cotización real (snapshot), (4) bloqueo por seña, (5) Kanban con drag-and-drop, (6) ficha técnica para operario móvil. Mapeados a F2-F5. @fecha-2026-09-02
- [x] **F0-07** Identificar las 4 micro-apps críticas del taller y verificar que existan como flujos. Ref: §5 del relevamiento (10 pasos del flujo integrado). **VERIFICADO 2026-09-02**: 4 micro-apps críticas en `docs/04-BUSINESS-RULES.md` §6: (1) Captura pedido público, (2) Configuración técnica y económica, (3) Producción y avance, (4) Caja y seña. Cada una mapeada a su grupo de tareas en F2-F5. @fecha-2026-09-02

## D. Cierre F0

- [x] **F0-08** Confirmar entendimiento del dominio y cerrar F0 con checklist de "¿podemos empezar a construir?". Ref: criterios de aceptación del relevamiento §8. **VERIFICADO 2026-09-02**: criterios de aceptación del MVP cruzados con fases: Captura pedido público → F3-F4; Biblioteca adjuntos → F4; Asociación archivo↔ubicación↔técnica → F4; Cotización trazable → F2-F3 (motor `pricing.ts` + snapshot en DB); Cálculo metros/kilos → F2 (receta + materials); Seña + bloqueo → F3-F5; Avance taller → F3-F4 (Kanban + ficha técnica operario). F0 cerrada, F1 (fundación) activa. @fecha-2026-09-02

---

## Resumen F0

- Tareas: 8 · Completadas: 8 · Pendientes: 0 — F0 finalizada.
- 37 pantallas Stitch catalogadas y mapeadas a rutas reales.
- 16 entidades del modelo relacional definidas en Drizzle.
- 4 micro-apps críticas mapeadas a fases de construcción.
- Gaps priorizados en `docs/05-GAP-ANALYSIS.md`.
- Siguiente fase: **F1 — Fundación** (scaffold, schema, auth, design system, UI primitives).