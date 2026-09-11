# F6 — Contexto completo del chat + plan de trabajo

> **Para el próximo agente/IA que retome este proyecto.** Este documento cuenta TODO lo que el
> usuario (Adrián) pidió en el chat del 2026-09-09, en orden cronológico, más el estado exacto
> de la implementación y lo que falta. Leelo entero antes de tocar código.
> Fecha de redacción: 2026-09-09. Commit base: `f879f8e` (master sincronizado con GitHub).

---

## 1. Dónde está parado el proyecto

- **Repo = `App de gestion/`** (la carpeta padre `ah sports/` solo tiene material origen: Stitch, .docx, relevamientos). Todos los comandos (`npm`, `git`) se corren adentro de `App de gestion/`.
- **Estado: MVP 108/108 production-ready** (F0–F5 completas, ver `BUILD_PROGRESS.md`). Esta fase nueva es **F6** (post-MVP).
- **Stack**: Next.js 15 + React 19 + TS strict + Drizzle ORM sobre `@neondatabase/serverless` + Tailwind v4 + Zod + auth propia (scrypt + cookie HMAC). Prohibido: Supabase, NextAuth, hex inline, Material Symbols.
- **`.env`** vive en `App de gestion/.env` (gitignored, con `DATABASE_URL` de Neon + `SESSION_SECRET`). Nunca commitear.
- **Reglas DB**: recon solo-lectura antes de escribir; `npm run db:seed` hace TRUNCATE destructivo (solo con confirmación explícita); migraciones `src/db/migrations/000<N>_*.sql` idempotentes (`IF NOT EXISTS`).
- **Convenciones**: Conventional Commits sin atribución IA; `tsc --noEmit` + `lint` + `build` en verde antes de marcar tareas; si cambia el schema → ADR en `docs/02-ARCHITECTURE.md`; features nuevas → archivo `BUILD_PROGRESS-F<N>.md`.

---

## 2. Todo lo que el usuario pidió en este chat (cronológico)

### Pedido 1 — Sincronizar con GitHub y tomar conocimiento (✅ HECHO)
- El usuario había avanzado en GitHub (PC/remoto) y el local estaba desactualizado.
- Se hizo: `git fetch` + backup del working tree sucio en
  `stash@{0} "backup-local-2026-09-09-antes-de-sync-con-github"` + `git pull --ff-only`
  de `01f49b8` → **`f879f8e`**. Working tree limpio.
- Lo que trajo el remoto (2 commits de Fabio Arias):
  - `fdd385c` — cierre MVP: login sin credenciales demo precargadas, seed exige
    `ADMIN_PASSWORD` (mín. 8, sin default), rate limit 5/min en `/api/auth/login`,
    headers + CSP, `render.yaml` + `Dockerfile`, `RELEASE-NOTES.md`, BUILD_PROGRESS 108/108.
  - `f879f8e` — fix CSP: agrega `script-src 'self' 'unsafe-inline'` (el payload de
    hydration `self.__next_f` moría con `default-src 'self'` solo).
- Consecuencia vigente: **`admin1234` ya no es password válida** (fue rotada en prod);
  el seed crea el admin con la `ADMIN_PASSWORD` del entorno.

### Pedido 2 — Leer la ficha de carga (✅ HECHO)
- Archivo: `docs/Ficha de carga de productos y costos AH Sports.docx` (idéntico en
  `ah sports/docs/`). Se extrajo el texto con python-docx: 18 párrafos + 5 tablas
  (fórmulas, carga de material, ficha producto, receta por prenda, decisiones comerciales).
- Idea central de la ficha: cargar cada material una vez (precio de compra + conversión
  kilo→metro + merma) y que la receta del producto calcule el costo automáticamente.

### Pedido 3 — Enlazar insumos/partes/accesorios al cargar un producto (✅ RESPONDIDO, ⏳ IMPLEMENTÁNDOSE)
- El usuario quiere: cargo todos los ítems (telas, avíos, accesorios, proveedores) y al
  cargar un producto (ej. una chomba) **enlazo todo** lo que lo compone.
- Respuesta dada: esa lógica **ya existe** y se llama **Receta / BOM**:
  `products` → `bom_recipes` (opcionalmente por talle y técnica) → `bom_items`
  (material + cantidad + merma %); el motor `src/lib/pricing.ts` suma costos, agrega
  técnica y aplica la regla de margen (`pricing_rules`); el pedido guarda `snapshot`.
- **3 huecos reales detectados** al verificar el código (esto motivó el Pedido 5):
  1. La conversión kilo→metro **NO estaba implementada** (`pricing.ts` hacía
     `cantidad × unitPrice` directo e ignoraba `metersPerKilo`).
  2. Proveedor era **texto libre** (`materials.supplier`), sin entidad ni contacto.
  3. El BOM no soporta **semielaborados propios** (producto-dentro-de-producto):
     `bom_items` solo apunta a `materials`. Si una "parte" se compra → va como material
     (categoría Avío/Accesorio). Decisión pendiente si algún día hacen partes internas.

### Pedido 4 — Proveedores como entidad (⏳ EN CURSO)
- El usuario dictaminó: el texto libre "está mal". Cada proveedor debe cargarse con
  **nombre, teléfono, email** (+ dirección, contacto, CUIT, notas) porque a futuro se
  quiere **automatizar hasta el contacto con los proveedores**: todo debe estar conectado.
- Implica: tabla `suppliers` + FK desde materiales + CRUD + migración + seed.

### Pedido 5 — Aplicar lo de `mirar.txt` + sumar lo pedido (⏳ EN CURSO)
- Archivo: `docs/mirar.txt.txt` (trackeado en git; el `.txt` duplicado es el nombre real).
  Lo escribió **otra IA en otra PC** que se apagó sin commitear: **el código descrito
  NO existe en este repo**, solo la descripción. Hay que implementarlo desde cero.
- Contenido del `mirar.txt` (comportamiento a lograr):
  1. Se carga el precio de compra del insumo.
  2. Si una tela se compra por kilo, se indican los metros útiles que rinde el kilo.
  3. En la receta se cargan los metros por prenda + merma.
  4. El sistema suma insumos y técnicas, aplica margen de Configuración y **redondea**.
  5. Cambio de costo ⇒ cotizaciones nuevas actualizadas; confirmadas conservan historial.
  6. Ajustes del panel: **productos sin precio manual** · insumos explican kilo→metro ·
     recetas indican unidad de consumo · **no cotizar sin receta ni sin rendimiento**.
  7. Cierra preguntando por datos de la primera camiseta de fútbol.
- **Decisión de implementación** (importante): el precio de venta se calcula como
  `costo × (1 + margen%) → recargo urgente → redondeo comercial de la regla`.
  `products.basePrice` **se conserva en DB** (no hay migración destructiva) pero deja de
  ser fuente de verdad; queda como referencia / override manual por línea
  (`overrideUnitPrice` en `quoteOrder`). `confirmQuote`/`reQuoteOrder` ya recalculan
  server-side con `quoteOrder()`, así que el cambio fluye solo a las cotizaciones.

### Pedido 6 — Documento guía rellenable (⏳ PENDIENTE)
- Nuevo documento (a generar, formato `.docx` como la ficha original) que sirva de
  **guía para leer e ir completando los datos necesarios**: qué cargar en cada caso,
  campo por campo, con ejemplos y espacios en blanco. El usuario lo completa, lo devuelve,
  y el agente **sube esos datos a la database** (Neon).
- Debe cubrir: Proveedores, Insumos, Técnicas, Productos (+ talles), Recetas, Reglas.

### Pedido 7 — Este documento (✅ ESTE ARCHIVO)
- Bajar todo el contexto del chat a un `.md` en `docs/` para que otro agente entienda
  qué se pidió, qué se está haciendo y pueda seguir ayudando.

### Pregunta abierta al usuario (sin responder al redactar este doc)
- ¿Empezamos cargando datos reales (insumos + una chomba con receta) para validar el flujo,
  o se implementa primero la conversión kilo→metro? (La implementación ya cubre ambas
  ramas: motor listo + guía de carga para los datos.)

---

## 3. Plan F6 — tareas y estado

| ID | Tarea | Estado al redactar |
|----|-------|--------------------|
| F6-01 | Entidad Proveedores: tabla `suppliers`, FK `materials.supplier_id`, migración `0003_suppliers.sql` + journal, backfill de nombres en texto libre | ✅ Código hecho (sin commitear) |
| F6-02 | API `GET/POST /api/suppliers` + `GET/PATCH /api/suppliers/[id]` con Zod | ⏳ Pendiente |
| F6-03 | Panel `/admin/proveedores` (lista + nuevo + editar) + link en sidebar | ⏳ Pendiente |
| F6-04 | Insumos con proveedor (select) + hints kilo→metro + validación `metersPerKilo` obligatorio si `unit=kilo` | ⏳ Parcial (solo validator + schema listos) |
| F6-05 | Motor: conversión kilo→metro + precio desde costo+margen+redondeo + bloqueo duro sin receta/rendimiento | ✅ Código hecho (sin commitear) |
| F6-06 | Blindar `confirmQuote`/`reQuoteOrder`/página cotizar ante errores de dominio (mensajes reales, no genérico de regla) | ✅ Código hecho (sin commitear) |
| F6-07 | Recetas: hint de unidad de consumo en el form de ítems | ⏳ Pendiente |
| F6-08 | ProductoForm: `basePrice` opcional con hint (referencia, no fuente de verdad) | ⏳ Pendiente |
| F6-09 | Seed: proveedores + vínculo en materiales | ⏳ Pendiente |
| F6-10 | `typecheck` + `lint` + `build` en verde | ⏳ Pendiente |
| F6-11 | Registrar F6: `BUILD_PROGRESS-F6.md` + ADR en `docs/02-ARCHITECTURE.md` + endpoints en `docs/03-API-ROUTES.md` | ⏳ Pendiente |
| F6-12 | Guía de carga v2 `.docx` rellenable (Pedido 6) | ⏳ Pendiente |

---

## 4. Decisiones técnicas ya tomadas (no reabrir sin motivo)

1. **Precio = costo × (1+margen) → urgente → redondeo.** Fuente: ficha Tabla 1 + `mirar.txt`
   punto 4. La columna `basePrice` no se elimina (migración no destructiva).
2. **Bloqueos duros con mensaje accionable** (no más costo 0 silencioso): sin receta →
   error que manda a `/admin/recetas`; kilo sin `metersPerKilo` → error que manda a
   `/admin/insumos`. Los errores de `quoteOrder()` se propagan con su mensaje
   (`confirmQuote`, `reQuoteOrder`, preview de cotizar con tarjeta de error + CTAs).
3. **Conversión kilo→metro**: `$consumo = $/kilo ÷ metrosPorKilo`; la receta siempre
   expresa la cantidad en la **unidad de consumo** (metros para telas por kilo).
4. **Validación en carga**: `materialSchema.refine` exige `metersPerKilo > 0` si
   `unit === "kilo"` (API + formularios que usen el schema).
5. **`materials.supplier` (texto) se conserva** como legado; lo canónico pasa a ser
   `supplierId` → `suppliers`. La migración hace backfill (un supplier por nombre
   distinto existente).
6. **Redondeo**: `Math.round(precio / rounding) * rounding` con `rounding` de la regla
   (default 100). Orden: margen → urgente → redondeo.

---

## 5. Archivos ya modificados en el working tree (SIN commitear al redactar)

- `src/db/schema.ts` — tabla `suppliers` + `materials.supplierId` (FK `set null`) +
  `suppliersRelations` + `materialsRelations`.
- `src/db/migrations/0003_suppliers.sql` — NUEVO (idempotente + backfill).
- `src/db/migrations/meta/_journal.json` — entrada `idx 2 / 0003_suppliers`.
- `src/lib/validators.ts` — `supplierSchema` nuevo; `materialSchema` += `supplierId` +
  `refine` kilo→`metersPerKilo`; `productSchema.basePrice` opcional (default 0).
- `src/lib/pricing.ts` — `consumptionUnitCost()` + `roundToStep()`; throw sin receta;
  precio desde costo+margen+urgente+redondeo (`overrideUnitPrice` como escape).
- `src/app/actions/orders.ts` — `confirmQuote`/`reQuoteOrder` propagan `e.message`.
- `src/app/(admin)/admin/pedidos/[id]/cotizar/page.tsx` — preview con try/catch
  (tarjeta de error + CTAs); warning re-redactado (receta vacía vs. sin receta).

---

## 6. Archivos a crear/modificar para terminar F6 (guía para el próximo agente)

- CREAR `src/app/api/suppliers/route.ts` (copiar patrón de `src/app/api/techniques/route.ts`:
  `requireUser()` + `safeParse` + insert; agregar `GET` listado como en
  `src/app/api/materials/route.ts` si lo tiene).
- CREAR `src/app/api/suppliers/[id]/route.ts` (copiar `src/app/api/materials/[id]/route.ts`:
  `PATCH` con `supplierSchema.partial()`; 404 si no existe).
- CREAR `src/app/(admin)/admin/proveedores/page.tsx` (copiar `admin/insumos/page.tsx`),
  `proveedores/nuevo/page.tsx` + `ProveedorForm.tsx` (copiar `InsumoForm.tsx`),
  `proveedores/[id]/page.tsx` (copiar `insumos/[id]/page.tsx`).
- EDITAR `src/app/(admin)/layout.tsx` — agregar `{ href: "/admin/proveedores",
  label: "Proveedores", icon: Truck }` (importar `Truck` de lucide-react; orden sugerido:
  después de Insumos).
- EDITAR `src/app/api/materials/route.ts` y `[id]/route.ts` — aceptar `supplierId`,
  validar que el supplier exista y denormalizar `supplier` (nombre) para compat.
- EDITAR `InsumoForm.tsx` — reemplazar input texto proveedor por `Select` (recibe
  `suppliers` por props desde `nuevo/page.tsx` y `[id]/page.tsx`, que deben volverse
  `async` y consultar `suppliers` activos); hint kilo→metro; `metersPerKilo` required
  cuando `unit === "kilo"`.
- EDITAR `RecetasEditor.tsx` — hint bajo el form de ítems + label
  `Cantidad (metros)` cuando el material elegido es `kilo` (`materialById` ya existe).
- EDITAR `ProductoForm.tsx` (`productos/nuevo/`) — `basePrice` no requerido + hint
  "Referencia: el precio de venta lo calcula la receta + margen".
- EDITAR `src/db/seed.ts` — insertar proveedores (los 4 del seed actual: Textil SA,
  Hilos del Norte, SubliMax, DTF Pro) y setear `supplierId` en materiales.
- CREAR `BUILD_PROGRESS-F6.md` (formato = copiar `BUILD_PROGRESS-F5.md`), actualizar
  tabla en `BUILD_PROGRESS.md`, ADR en `docs/02-ARCHITECTURE.md` (§ decisiones),
  filas de suppliers en `docs/03-API-ROUTES.md`.
- CREAR guía v2 `.docx` (Pedido 6) con python-docx (hay `python-docx` instalado en el
  Python del sistema): secciones Proveedor/Insumo/Técnica/Producto/Receta/Reglas, cada
  una con qué-es + campo-por-campo + ejemplo + tabla vacía para completar.
- VERIFICAR: `npm run typecheck`, `npm run lint`, `npm run build`. Migración real solo
  con `npm run db:migrate` (idempotente; NUNCA `db:seed` sin OK del usuario).
- COMMITS: solo si el usuario lo pide explícito. Convencionales, sin atribución IA.

---

## 7. Notas y gotchas para el próximo agente

- `quoteOrder()` ahora **lanza excepciones** — cualquier nuevo caller debe usar try/catch.
- El `PATCH` de materiales usa `materialSchema.partial()` + `refine`: en parcial, si el
  payload trae `unit: "kilo"` sin `metersPerKilo` en el MISMO payload, el refine falla
  aunque la DB ya tenga rendimiento. Caso borde conocido: el form siempre manda el objeto
  completo, así que en la práctica no pega; si se expone PATCH parcial a terceros,
  mover la validación kilo→rendimiento al nivel de fila combinada.
- `render.yaml` del remoto usa `db:push` en el buildCommand (deuda conocida, ver README
  local vs remoto); no tocar en F6.
- La columna `materials.supplier` (texto) sigue existiendo: no borrar hasta migrar todas
  las lecturas (InsumosTable la muestra; evaluar join a supplier en F6 o después).
- `Step2Form` público y `AddLineForm` muestran `basePrice` como referencia: con F6 ese
  número puede quedar desactualizado respecto al precio calculado. Deuda consciente para
  F6+ (recalcular preview al confirmar ya es correcto vía `confirmQuote`).
- Engram: hay memoria del proyecto (`app de gestion`); ante decisión/bugfix/discovery,
  guardar con `mem_save` y cerrar sesión con `mem_session_summary`.

## 8. Correcciones posteriores a la auditoría F6

La auditoría detectó riesgos que no estaban resueltos en la implementación inicial. La versión actual los corrige así:

- `confirmQuote` y `reQuoteOrder` cargan `order_items` en servidor y pasan cantidades agrupadas por `sizeId` a `quoteOrder`; el snapshot incluye `sizeBreakdown` y los IDs de los materiales/técnicas.
- La edición de talles sincroniza por ID. No borra y recrea filas existentes; las eliminaciones con recetas o prendas históricas devuelven `409` y la FK de recetas usa `RESTRICT`.
- `setupCost` se cobra una vez por línea/lote. `costPerSquareMeter` requiere aplicaciones de la línea con la técnica y ancho/alto; de lo contrario cotizar devuelve un error explícito.
- El PATCH de materiales valida `unit` y `metersPerKilo` combinando payload + fila persistida.
- La API de recetas comprueba la pertenencia del talle al producto.
- La migración `0004_f6_integrity.sql` fusiona proveedores duplicados normalizados antes de crear el índice único. No fue ejecutada durante la corrección.
