# F6 — Proveedores, BOM por talle y costos trazables

> Correcciones de integridad, pricing y clasificación general para dejar el flujo listo antes de cargar datos reales.

## Estado

- [x] Proveedores como entidad (`suppliers`) con FK canónica desde materiales y backfill compatible.
- [x] CRUD autenticado de proveedores con validación Zod y rechazo de nombres duplicados normalizados.
- [x] Materiales con conversión kilo → metro y PATCH validando el estado final combinado.
- [x] Cotización server-side por cantidades reales de `order_items`, con receta específica por talle y `sizeBreakdown` en el snapshot.
- [x] Cambio de costos/técnicas no altera snapshots históricos; confirmar y re-cotizar siempre recalculan en servidor.
- [x] `costPerUnit` por prenda, `setupCost` una vez por línea/lote y `costPerSquareMeter` calculado desde aplicaciones medidas; sin medidas, se bloquea con error accionable.
- [x] Edición de talles preserva IDs; eliminar talles con recetas o prendas históricas devuelve conflicto. FK de recetas endurecida a `RESTRICT`.
- [x] API de recetas valida que el talle pertenezca al producto.
- [x] UI de talles muestra errores de eliminación segura y UI de cotización muestra el reparto por talle.
- [x] Documentación actualizada: arquitectura, rutas y reglas de negocio.
- [x] Guía de carga de datos `.docx` disponible en `docs/Guia de carga de datos AH Sports.docx`.
- [x] Consumo BOM explícito por talle: modo directo o rendimiento, con fórmula, merma, validación y snapshot trazable.
- [x] Medidas terminadas de talles tipadas como valores numéricos y editables por campo, separadas del consumo de corte.
- [x] Migración idempotente `0005_bom_consumption.sql` preparada; no ejecutada.
- [x] Familias/tipos de prenda, moldes reutilizables y validación de medidas por esquema.
- [x] Productos compuestos preparados con componentes, cantidades y resolución de talles; pricing deriva sus costos/precios.
- [x] Taxonomía general extensible en productos: categoría, subcategoría y tipo; prendas, mercería, bolsos, mochilas infantiles, manteles de jardín, guardapolvos de jardín y otros.
- [x] Molde/familia/tipo de prenda opcionales para productos no textiles; recetas y pedidos sin talle siguen soportados.
- [x] Migración idempotente `0007_product_taxonomy.sql` aplicada a Neon junto con `0003`–`0006`.

## Migraciones aplicadas en Neon

- `0003_suppliers.sql`: proveedores y vínculo canónico desde materiales.
- `0004_f6_integrity.sql`: integridad de recetas y unicidad normalizada de proveedores.
- `0005_bom_consumption.sql`: modo/cantidad/rendimiento explícitos en BOM.
- `0006_garment_families_bundles.sql`: familias, moldes base y conjuntos.
- `0007_product_taxonomy.sql`: categoría, subcategoría y tipo general; backfill compatible.

## Verificación

- `npm run typecheck`: ✅ OK (2026-09-10).
- `npm run lint`: ✅ OK con warnings preexistentes (2026-09-10).
- `npm run build`: ✅ OK (2026-09-10).
- `npm run db:migrate`: ✅ aplicado en Neon; verificación de metadatos confirmó 7 migraciones y tablas/columnas esperadas. `db:seed` no ejecutado.

## Riesgos y límites conocidos

- Una técnica con costo por m² necesita aplicaciones asociadas a la línea con técnica, ancho y alto; el sistema no inventa un área.
- `products.basePrice` queda como referencia heredada; la cotización usa costo + margen salvo `overrideUnitPrice` explícito.
- La columna `materials.supplier` se conserva como compatibilidad histórica y se sincroniza al usar `supplierId`.
