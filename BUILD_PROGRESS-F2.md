# ⏳ F2 — Núcleo operativo (Productos + Insumos + Técnicas + Recetas + Talles + Pricing rules)

> **Propósito**: habilitar la carga y configuración de toda la "biblioteca técnica y económica" del taller. Sin esto, no se puede cotizar trazablemente.
>
> **Estado al 2026-09-04**: ⏳ EN CURSO — 7/22 tareas. Grupo A (Materiales) completo en código. Antes de seguir, leer `KNOWN-ISSUES.md`. KI-01 ya no existe en el código actual (verificado por lectura 2026-09-04); KI-13 documenta el gate de lint roto a nivel toolchain.
>
> Regla: TODOS los precios críticos son editables desde UI. NADA hardcoded en el código.

---

## A. Materiales / Insumos (catálogo base)

- [x] **F2-01** Página `/admin/insumos` — Server component que carga `materials` activos con filtros. @fecha-2026-09-04 VERIFICADO con `npm run typecheck` + `npm run build` EXIT 0 (filtros client en `InsumosTable.tsx`: búsqueda, chips por categoría, switch solo-activos).
  - Query: `db.select({id, name, category, unit, unitPrice, supplier, active}).from(materials).orderBy(desc(materials.createdAt)).limit(500)`
  - Filtros UI (client component encima): input de búsqueda por name (case-insensitive sobre el array cargado), chips toggle por categoría, switch "solo activos"
  - UI: `<Table>` con cols: name, category, unit, unitPrice (formateado con `formatCurrency` de `lib/utils`), supplier, badge active/inactive, link a detalle
  - Empty state: `EmptyState` con CTA "Cargar primer material" → `/admin/insumos/nuevo`
  - Header: `PageHeader title="Materiales e insumos" subtitle={count + ' materiales en el catálogo'} action={<LinkButton href="/admin/insumos/nuevo">+ Nuevo insumo</LinkButton>}`
  - Verificar: con seed cargado muestra 5+ filas. Sin DB: muestra empty state sin romper.

- [x] **F2-02** Página `/admin/insumos/nuevo` — Alta de material con `InsumoForm`. @fecha-2026-09-04 VERIFICADO por lectura de código (form con los 10 campos del spec + POST validado con Zod) + `npm run build` EXIT 0. Ejecución contra Neon pendiente (sin DATABASE_URL).
  - Reusa `InsumoForm` (ya existe en F1, verificar que esté bien). Campos: name (text, required), category (text, required), unit (Select con 7 valores enum `materialUnit`: metro|kilo|unidad|centimetro|mililitro|metro_cuadrado|rollo), unitPrice (number, step 0.01, required, min 0), supplier (text, optional), width (number, opcional, solo telas), gramsPerMeter (number, opcional), metersPerKilo (number, opcional), yieldPercent (number, default 85), notes (textarea, opcional)
  - Action: `POST /api/materials` con JSON (Zod valida en route)
  - Zod schema en route: `z.object({name: z.string().min(1).max(255), category: z.string().min(1).max(128), unit: z.enum(["metro","kilo","unidad","centimetro","mililitro","metro_cuadrado","rollo"]), unitPrice: z.number().min(0), supplier: z.string().optional().nullable(), width: z.number().optional().nullable(), gramsPerMeter: z.number().optional().nullable(), metersPerKilo: z.number().optional().nullable(), yieldPercent: z.number().min(0).max(100).default(85), notes: z.string().optional().nullable()})`
  - Verificar: form submit → 200 → redirect a `/admin/insumos` → fila aparece en listado.

- [x] **F2-03** Página `/admin/insumos/[id]` — Edición de material con mismo `InsumoForm` reutilizable. @fecha-2026-09-04 VERIFICADO por lectura + build EXIT 0 (incluye botón Desactivar/Reactivar con soft-delete vía PATCH `active`, `notFound()` si no existe).
  - Carga: `const [m] = await db.select().from(materials).where(eq(materials.id, id)).limit(1)`. Si no existe → `notFound()`
  - Pasa initial values al form. Form detecta initial y llama `PATCH /api/materials/[id]` en vez de POST
  - Action adicional: botón "Desactivar" que llama `PATCH /api/materials/[id]` con `active=false` (soft-delete). Confirmación con `confirm()` antes
  - NO hard-delete. Materiales referenciados en `bomItems` históricos NO deben borrarse nunca (preservar trazabilidad de cotizaciones viejas)
  - Verificar: editar precio → cotizar un pedido viejo → snapshot del pedido NO cambia (snapshot inmutable).

- [x] **F2-04** API `POST /api/materials` + `PATCH /api/materials/[id]` (DELETE NO — soft-delete en PATCH). @fecha-2026-09-04 VERIFICADO con typecheck+build EXIT 0 (Zod `materialSchema` en `src/lib/validators.ts` + 400/401/404; PATCH parcial, sin hard-delete).
  - POST: `requireUser()` → parse body con Zod → insertar → return row
  - PATCH: `requireUser()` → parse partial Zod → update → return row
  - Errores: 400 Zod falla, 401 sin sesión, 500 error DB
  - Verificar: `curl -X POST /api/materials -H "Cookie: ah_session=..." -d '{"name":"Test","category":"Tela","unit":"metro","unitPrice":100}'` → 200 + row.

## B. Técnicas / Operaciones (costos de producción)

- [x] **F2-05** Seed de 5 técnicas base en `db/seed.ts` (parte de F2-20). @fecha-2026-09-04 VERIFICADO código (5 técnicas con los costos del spec) + typecheck EXIT 0. Ejecución `npm run db:seed` pendiente de DATABASE_URL real.
  - Sublimación: `costPerUnit=0, costPerSquareMeter=2500, setupCost=0` (depende del area)
  - DTF: `costPerUnit=0, costPerSquareMeter=4500, setupCost=0`
  - Bordado: `costPerUnit=800, costPerSquareMeter=0, setupCost=2000` (costo por prenda + setup)
  - Serigrafía: `costPerUnit=600, costPerSquareMeter=0, setupCost=3500`
  - Vinilo: `costPerUnit=400, costPerSquareMeter=0, setupCost=0`
  - Verificar: tras seed, `db.select().from(techniques)` muestra 5 rows.

- [x] **F2-06** Página `/admin/tecnicas` — Listado + alta + edición de técnicas. @fecha-2026-09-04 VERIFICADO e2e contra Neon: página 200 con fila creada visible, alta/edición/desactivar desde `TecnicasManager.tsx`; ítem agregado al sidebar. Dropdowns F3-09/F4-05 aún no existen (fases futuras).
  - Estructura idéntica a `/admin/insumos` pero con campos: name (text, required), costPerUnit (number, default 0), costPerSquareMeter (number, default 0), setupCost (number, default 0), description (textarea, opcional), active (switch)
  - Tabla: name, costPerUnit, costPerSquareMeter, setupCost, badge active, link detalle
  - Verificar: alta nueva técnica aparece en dropdowns de líneas de pedido (F3-09) y aplicaciones de adjuntos (F4-05).

- [x] **F2-07** API `POST /api/techniques` + `PATCH /api/techniques/[id]`. @fecha-2026-09-04 VERIFICADO e2e: POST crea, Zod rechaza inválido con 400, PATCH edita/desactiva (404 si no existe). Técnica de prueba desactivada al cierre.
  - Mismo patrón que F2-04. Zod: `{name: z.string().min(1).max(128), costPerUnit: z.number().min(0).default(0), costPerSquareMeter: z.number().min(0).default(0), setupCost: z.number().min(0).default(0), description: z.string().optional().nullable()}`
  - Verificar: API funcional con `curl` + tsc EXIT 0.

## C. Productos + Zonas

- [x] **F2-08** Página `/admin/productos` — Catálogo. @fecha-2026-09-04 VERIFICADO por lectura (query + tabla SKU/nombre/categoría/precio/zonas + empty state) + build EXIT 0.
  - Query: `db.select().from(products).orderBy(desc(products.createdAt)).limit(500)`
  - Tabla: SKU, name, category, basePrice (formatCurrency), zones (join del array con coma), badge active, link a `/admin/productos/[id]`
  - Header: count + LinkButton "+ Nuevo producto"
  - Verificar: con seed muestra 4+ productos. Link abre detalle.

- [x] **F2-09** Página `/admin/productos/nuevo` — Alta con selector visual de zonas. @fecha-2026-09-04 VERIFICADO por lectura (`ProductoForm` con chips `COMMON_ZONES` de 11 zonas → jsonb) + e2e: producto creado con zonas persiste.
  - Reusa `ProductoForm` (ya existe en F1). Verificar que pasa correctamente el array `zones` como JSON al POST.
  - Selector de zonas: chips toggle sobre 11 zonas predefinidas (ver constante `COMMON_ZONES` en `ProductoForm.tsx` ya creado). Multi-select
  - Verificar: crear producto con 3 zonas seleccionadas → en DB se guarda `zones: ["Pecho izquierdo","Espalda alta","Manga derecha"]` como jsonb.

- [x] **F2-10** Página `/admin/productos/[id]` — Detalle con sub-secciones. @fecha-2026-09-04 VERIFICADO (layout 2 columnas + cards Talles/Recetas con links; removido código muerto `items` e imports sin uso). Link a `/recetas` apunta a F2-15 (misma fase, pendiente).
  - Carga: producto + sizes (F2-12) + recipes (F2-15)
  - Layout: 2 columnas en desktop. Izq: `ProductoForm` con initial values (editable). Der: zonas como chips.
  - Abajo: 2 cards: "Talles" (tabla + link a `/admin/productos/[id]/talles`) y "Recetas técnicas (BOM)" (lista de recipes + link a `/admin/productos/[id]/recetas`)
  - Verificar: editar precio base desde form → guardar → recotizar pedido (F3) usa nuevo precio.

- [x] **F2-11** API `POST /api/products` + `PATCH /api/products/[id]` + `DELETE /api/products/[id]` (soft-delete). @fecha-2026-09-04 VERIFICADO e2e: Zod (`productSchema`), SKU duplicado→409, inválido→400, PATCH parcial + 404, DELETE soft. Producto de prueba eliminado.
  - POST: Zod `{sku: z.string().min(1).max(64), name: z.string().min(1).max(255), description: z.string().optional().nullable(), category: z.string().optional().nullable(), basePrice: z.number().min(0), minOrder: z.number().int().min(1).default(1), zones: z.array(z.string()).default([])}`. SKU único → manejar 409 si duplicado
  - PATCH: partial Zod, mismo formato
  - DELETE: `requireUser` → `db.update(products).set({active: false}).where(eq(products.id, id))` → return `{ok:true}`
  - Verificar: 3 endpoints funcionales + tsc EXIT 0.

## D. Talles + Moldes

- [x] **F2-12** Página `/admin/productos/[id]/talles` — Editor inline. @fecha-2026-09-04 VERIFICADO e2e: página 200 con talles upserteados visibles (`SizesManager` + orden + measurements).
  - Reusa `SizesManager` (ya existe en F1). Verificar UI funcional: input orden, label, measurements (string "ancho:50, largo:70, manga:20" → parseado a jsonb `Record<string, number>`).
  - Carga: `db.select().from(sizes).where(eq(sizes.productId, id)).orderBy(asc(sizes.order))`
  - Guardar: client component → `POST /api/products/[id]/sizes` con `{sizes: [...]}`
  - Verificar: agregar talle "M" con medidas → aparece en tabla → disponible en dropdown al crear línea (F3-09).

- [x] **F2-13** API `POST /api/products/[id]/sizes` — Upsert batch. @fecha-2026-09-04 VERIFICADO e2e: Zod (`sizesBatchSchema`), 404 si el producto no existe, upsert 2 talles OK.
  - Body: `{sizes: Array<{id?: string, label: string, order: number, measurements: Record<string, number>}>}`
  - Lógica: `db.delete(sizes).where(eq(sizes.productId, id))` luego `db.insert(sizes).values(...)` con todos los nuevos
  - Validación Zod: cada size `{label: z.string().min(1).max(32), order: z.number().int().min(0), measurements: z.record(z.number())}`
  - Verificar: pasar 5 talles (S/M/L/XL/XXL) → 5 rows en DB, todas con productId correcto.

## E. Recetas técnicas (BOM)

- [x] **F2-14** Página `/admin/recetas` — Listado global agrupado por producto. @fecha-2026-09-04 VERIFICADO e2e (SDD apply): query spec exacta, conteo items, agrupado por producto con link al editor; página 200 con grupo de prueba visible. Implementado por subagente sdd-apply, verificado por orquestador.
  - Query: `db.select({recipe: bomRecipes, product: products, technique: techniques}).from(bomRecipes).leftJoin(products, eq(bomRecipes.productId, products.id)).leftJoin(techniques, eq(bomRecipes.techniqueId, techniques.id))`
  - Para cada recipe, contar `bomItems` con sub-query o segunda query
  - UI: agrupado por producto (header con nombre + SKU), cada recipe como card con: técnica, talle (si aplica), N items en BOM, link a `/admin/productos/[productId]/recetas`
  - Verificar: con seed muestra recetas de los 4 productos demo.

- [x] **F2-15** Página `/admin/productos/[id]/recetas` — Editor de recetas (matriz material × talle + items). @fecha-2026-09-04 VERIFICADO e2e: accordion por técnica, alta de item (0.92m 8% visible en editor), crear receta, borrar item con confirmación. Datos de prueba eliminados.
  - Estructura: tabs o accordion por técnica. Por cada (talle, técnica) combinación, mostrar items del BOM.
  - Agregar item: form inline con `<Select>` material (de `materials` activos), input quantity (number, step 0.001), input wastePercent (number, step 0.1, default 0)
  - Server action `addRecipeItem({recipeId, materialId, quantity, wastePercent})` valida Zod, inserta
  - Botón "X" en cada item llama `removeRecipeItem(itemId)` con confirmación
  - Crear recipe nueva: form con `<Select>` técnica + opcional talle
  - Verificar: agregar "Tela set poliester 0.92m 8% merma" a receta "Camiseta deportiva M Sublimación" → persiste → cotización usa este consumo.

- [x] **F2-16** API CRUD de recipes: `POST /api/recipes`, `POST /api/recipes/[id]/items`, `DELETE /api/recipes/items/[id]`. @fecha-2026-09-04 VERIFICADO e2e: Zod en ambos POST, 404 producto/receta/item inexistente, 400 qty inválida, DELETE→200 + 404 en reintento.
  - `POST /api/recipes` body: `{productId, sizeId?, techniqueId?, notes?}` → insertar bomRecipe. Zod valida FK existentes.
  - `POST /api/recipes/[id]/items` body: `{materialId, quantity, wastePercent}` → insertar bomItem. quantity > 0.
  - `DELETE /api/recipes/items/[id]` → soft-delete? NO — los items son detalles de receta, hard-delete OK (solo se borra si la receta se está editando)
  - Verificar: API funcional + tsc EXIT 0.

## F. Reglas de pricing

- [x] **F2-17** Página `/admin/configuracion` → sección "Reglas de precio". @fecha-2026-09-04 VERIFICADO e2e (SDD apply): página 200 con ambas reglas visibles, form inline "Nueva regla", activación exclusiva comprobada en DB (al activar la 2da, Estándar 2026 se desactiva sola). Implementado por subagente sdd-apply.
  - Form: listar todas las `pricingRules`. Cada una: name, marginPercent (default 40), urgentSurcharge (default 15), minAdvancePercent (default 50), rounding (default 100), active (switch)
  - Solo UNA regla puede estar `active=true` simultáneamente. Al activar una, desactivar las otras (transacción o `update` masivo en una sola query).
  - Botón "Nueva regla" abre form inline
  - Verificar: con seed muestra 1 regla activa ("Estándar 2026"). Crear segunda, activar → la primera se desactiva automáticamente.

- [x] **F2-18** Seed de regla "Estándar 2026" en `db/seed.ts` (parte de F2-20). @fecha-2026-09-04 VERIFICADO código (margen 40, recargo 15, seña 50, redondeo 100, activa) — resuelve KI-06 por diseño (el motor siempre encuentra regla tras el seed).
  - `{name: "Estándar 2026", marginPercent: 40, urgentSurcharge: 15, minAdvancePercent: 50, rounding: 100, active: true}`
  - Verificar: tras seed, `db.select().from(pricingRules).where(eq(pricingRules.active, true))` devuelve 1 row.

- [x] **F2-19** API `POST /api/pricing-rules` + `PATCH /api/pricing-rules/[id]`. @fecha-2026-09-04 VERIFICADO e2e: Zod (inválido→400), PATCH activa/desactiva con exclusión mutua, 404 si no existe. Invariante restaurado (solo Estándar 2026 activa, regla de prueba eliminada).
  - Zod: `{name: z.string().min(1).max(128), marginPercent: z.number().min(0).max(500), urgentSurcharge: z.number().min(0).max(100), minAdvancePercent: z.number().min(0).max(100), rounding: z.number().int().min(1).default(100), active: z.boolean().default(false)}`
  - En PATCH, si `active=true`, transacción que desactiva todas las otras reglas antes de activar esta
  - Verificar: API funcional + caso "activar una desactiva las demás".

## G. Seed de datos demo (F2-20 — bloqueante)

- [x] **F2-20** `src/db/seed.ts` — Crea admin user + organización demo + 5 materiales + 3+ técnicas + 4 productos + talles + recetas + regla pricing. @fecha-2026-09-04 VERIFICADO código (admin, Club Renacer + contacto, 5 materiales, 5 técnicas, regla activa, 4 productos, 8 talles, 1 receta BOM con 4 items) + typecheck EXIT 0 + `npm run db:seed` falla solo por DATABASE_URL ausente (mensaje explícito KI-10, comportamiento esperado). Ejecución real contra Neon pendiente.
  - **Estructura del script**:
    ```ts
    import { db } from "./client";
    import { users, organizations, contacts, materials, techniques, products, sizes, bomRecipes, bomItems, pricingRules } from "./schema";
    import { hashPassword } from "@/lib/auth";
    import { sql } from "drizzle-orm";
    
    async function main() {
      // 1. Limpiar todo (orden importa por FKs)
      await db.execute(sql`TRUNCATE TABLE production_events, payments, applications, attachments, order_items, order_lines, orders, bom_items, bom_recipes, sizes, products, pricing_rules, techniques, materials, contacts, organizations, sessions, users RESTART IDENTITY CASCADE`);
      
      // 2. Admin
      const [admin] = await db.insert(users).values({
        email: "admin@ahsports.com",
        passwordHash: hashPassword("admin1234"),
        name: "Admin AH Sports",
        role: "admin",
      }).returning();
      
      // 3. Organización demo
      const [org] = await db.insert(organizations).values({
        kind: "club",
        name: "Club Renacer",
        notes: "Cliente demo seed",
      }).returning();
      
      // 4. Contacto demo
      await db.insert(contacts).values({
        organizationId: org.id,
        name: "Juan Pérez",
        email: "juan@clubenazar.com",
        phone: "+5493704567890",
        role: "Delegado",
        status: "calificado",
      });
      
      // 5. 5 materiales
      const [telaSet, hilo, papel, tinta, dtf] = await db.insert(materials).values([
        {name: "Set poliéster azul", category: "Tela", unit: "metro", unitPrice: 4500, supplier: "Textil SA", gramsPerMeter: "150", metersPerKilo: "6.5", yieldPercent: 92},
        {name: "Interlock blanco", category: "Tela", unit: "metro", unitPrice: 3800, supplier: "Textil SA", gramsPerMeter: "180", yieldPercent: 90},
        {name: "Hilo polyester", category: "Insumo", unit: "metro", unitPrice: 12, supplier: "Hilos del Norte", yieldPercent: 100},
        {name: "Papel sublimación A4", category: "Insumo", unit: "unidad", unitPrice: 85, supplier: "SubliMax", yieldPercent: 95},
        {name: "Film DTF", category: "Insumo", unit: "metro_cuadrado", unitPrice: 8500, supplier: "DTF Pro", yieldPercent: 90},
      ]).returning();
      
      // 6. 5 técnicas
      const [sublimacion, dtfTech, bordado, serigrafia, vinilo] = await db.insert(techniques).values([
        {name: "Sublimación", costPerUnit: 0, costPerSquareMeter: 2500, setupCost: 0},
        {name: "DTF", costPerUnit: 0, costPerSquareMeter: 4500, setupCost: 0},
        {name: "Bordado", costPerUnit: 800, costPerSquareMeter: 0, setupCost: 2000},
        {name: "Serigrafía", costPerUnit: 600, costPerSquareMeter: 0, setupCost: 3500},
        {name: "Vinilo", costPerUnit: 400, costPerSquareMeter: 0, setupCost: 0},
      ]).returning();
      
      // 7. Regla pricing
      await db.insert(pricingRules).values({
        name: "Estándar 2026",
        marginPercent: 40,
        urgentSurcharge: 15,
        minAdvancePercent: 50,
        rounding: 100,
        active: true,
      });
      
      // 8. 4 productos
      const [camiseta, short, musculosa, botinera] = await db.insert(products).values([
        {sku: "CAM-SUB-001", name: "Camiseta deportiva manga corta", category: "Camisetas", basePrice: 8500, minOrder: 10, zones: ["Pecho izquierdo","Pecho central","Espalda alta","Espalda baja","Manga izquierda","Manga derecha"]},
        {sku: "SHO-DEP-001", name: "Short deportivo", category: "Shorts", basePrice: 6500, minOrder: 10, zones: ["Pierna izquierda","Pierna derecha","Espalda baja"]},
        {sku: "MUS-DEP-001", name: "Musculosa training", category: "Musculosas", basePrice: 7200, minOrder: 10, zones: ["Pecho central","Espalda alta"]},
        {sku: "BOT-001", name: "Botinera", category: "Accesorios", basePrice: 4500, minOrder: 1, zones: ["Frente completo"]},
      ]).returning();
      
      // 9. Talles S/M/L/XL para camiseta y short
      const talleData = [
        {productId: camiseta.id, label: "S", order: 1, measurements: {ancho: 48, largo: 68, manga: 18}},
        {productId: camiseta.id, label: "M", order: 2, measurements: {ancho: 52, largo: 72, manga: 20}},
        {productId: camiseta.id, label: "L", order: 3, measurements: {ancho: 56, largo: 74, manga: 21}},
        {productId: camiseta.id, label: "XL", order: 4, measurements: {ancho: 60, largo: 76, manga: 22}},
        {productId: short.id, label: "S", order: 1, measurements: {cintura: 70, largo: 42}},
        {productId: short.id, label: "M", order: 2, measurements: {cintura: 76, largo: 44}},
        {productId: short.id, label: "L", order: 3, measurements: {cintura: 82, largo: 46}},
        {productId: short.id, label: "XL", order: 4, measurements: {cintura: 88, largo: 48}},
      ];
      const insertedTalles = await db.insert(sizes).values(talleData).returning();
      const camisetaM = insertedTalles.find(s => s.productId === camiseta.id && s.label === "M")!;
      
      // 10. Recetas (BOM)
      const [recetaCamisetaM] = await db.insert(bomRecipes).values({
        productId: camiseta.id,
        sizeId: camisetaM.id,
        techniqueId: sublimacion.id,
        notes: "Camiseta M sublimada full",
      }).returning();
      
      await db.insert(bomItems).values([
        {recipeId: recetaCamisetaM.id, materialId: telaSet.id, quantity: "0.92", wastePercent: 8},
        {recipeId: recetaCamisetaM.id, materialId: hilo.id, quantity: "8", wastePercent: 0},
        {recipeId: recetaCamisetaM.id, materialId: papel.id, quantity: "1.05", wastePercent: 5},
        {recipeId: recetaCamisetaM.id, materialId: tinta.id, quantity: "0.04", wastePercent: 5},
      ]);
      
      console.log("✅ Seed completo. Login: admin@ahsports.com / admin1234");
    }
    
    main().catch((e) => { console.error(e); process.exit(1); });
    ```
  - Verificar: `npm run db:seed` ejecuta sin errores. `npm run db:studio` muestra las 5 tablas con datos. `curl -X POST /api/auth/login -d '{"email":"admin@ahsports.com","password":"admin1234"}' -H "Content-Type: application/json"` devuelve 200.

## H. Cierre F2

- [x] **F2-21** Validación end-to-end: `npm run build` EXIT 0 + `npm run dev` levanta en :3000 + login con seed + crear material desde UI + curl POST /api/products funcional. @fecha-2026-09-04 VERIFICADO contra Neon real: `db:push` (19 tablas), `db:seed` (1 user, 6 materiales, 5 técnicas, 4 productos, 8 talles, 1 receta, 1 regla), login `admin@ahsports.com` OK, POST/PATCH/soft-delete materials y products vía API con sesión, `/admin/insumos` renderiza 200 con la fila nueva en HTML, `quoteOrder` 10 camisetas M sublimadas = costo $46.649 / precio $85.000 / margen 45,12%. Datos de prueba desactivados (soft-delete) y server apagado al cierre.
  - Verificar: con DB en Neon real, todo el flujo funciona. Sin Neon (modo dev), debe fallar con mensaje claro (KI-10).

- [x] **F2-22** Actualizar `BUILD_PROGRESS.md` marcando F2-NN como `[x]` con `@fecha-2026-09-04` + breve VERIFICADO. F2 completa 22/22: grupos A–G con typecheck+build+e2e contra Neon real en cada grupo.

---

## Resumen F2

- Tareas: 22 · Completadas: 22 · Pendientes: 0 ✅ FASE COMPLETA
- 7 grupos: A (Materiales 4) · B (Técnicas 3) · C (Productos 4) · D (Talles 2) · E (Recetas 3) · F (Pricing rules 3) · G (Seed 1, F2-20 bloqueante) · H (Cierre 2)
- Salida esperada: el administrador puede cargar TODO el catálogo técnico y económico, y el motor `pricing.ts` puede cotizar contra datos reales.
- Prereq bugs a arreglar: **KI-01, KI-09** (F2-20 cubre KI-09), **KI-10** (en el seed script)
- Prereq bugs que se resuelven con F2: **KI-09** (seed), **KI-06** (F2-18 provee regla activa por defecto)