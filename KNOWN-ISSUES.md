# KNOWN ISSUES — Bugs en el código de F1 (BUILD BREAKERS)

> Lista verificada leyendo el código de `src/` en 2026-09-03.
> **No asumás que `npm run build` ni `npm run dev` funcionan.** Arreglá estos issues antes de empezar F2.

---

## KI-01 · `(admin)/layout.tsx:11-18` — Query rota, código muerto

**Archivo**: `src/app/(admin)/layout.tsx` líneas 11-18

```ts
const [counts] = await db
  .select({
    active: count(),
    blocked: sum(
      // raw count workaround via separate query below
    ),
  })
  .from(orders);
```

**Problema**:
1. `sum()` con `sql` template vacío es **inválido en Drizzle**. Va a tirar error de tipos o runtime.
2. La variable `counts` se declara con `const [counts]` (destructuring de un array) pero Drizzle `.select()` devuelve un array — la sintaxis es correcta, pero la query está mal.
3. **La variable `counts` NUNCA se usa** en el resto del layout (las queries reales son `activeRows` y `blockedRows` abajo).

**Fix recomendado** (Next.js agent):
```ts
// ELIMINAR las líneas 11-18 enteras
// El sidebar ya usa activeRows.length y blockedRows.length
```

**Impacto**: rompe `tsc --noEmit` y/o `next build` con error de tipo o runtime.

---

## KI-02 · `pedidos/[id]/page.tsx` — Links a rutas inexistentes

**Archivo**: `src/app/(admin)/admin/pedidos/[id]/page.tsx`

Links que rompen (404 al hacer click):

| Línea | Link | Ruta destino | ¿Existe? |
|-------|------|--------------|----------|
| 96 | "Vista cliente" | `/seguimiento/${order.publicToken}` | ❌ NO (F4-14) |
| 99 | "Planilla" | `/admin/pedidos/${order.id}/planilla` | ❌ NO (F3-10) |
| 102 | "Arte" | `/admin/pedidos/${order.id}/arte` | ❌ NO (F4-02) |
| 105 | "Ficha técnica" | `/admin/pedidos/${order.id}/ficha-tecnica` | ❌ NO (F3-12) |
| 136 | "Cotizar" | `/admin/pedidos/${order.id}/cotizar` | ❌ NO (F3-15) |
| 139 | "Pago" | `/admin/pedidos/${order.id}/pagos` | ❌ NO (F5-04) |
| 148 | "Organización" | `/admin/organizaciones/${org.id}` | ❌ NO (F3-03) |
| 160 | "Asignar organización" | `/admin/pedidos/${order.id}/asignar-cliente` | ❌ NO |
| 165 | "Agregar línea" | `/admin/pedidos/${order.id}/linea/nueva` | ❌ NO (F3-09) |

**Fix recomendado**: o bien (a) implementar las rutas, o bien (b) hacer que el botón no sea clickeable (gris) con tooltip "Próximamente" hasta que llegue esa fase. NO dejar links rotos.

**Impacto**: UX rota, no rompe build pero sí navegación.

---

## KI-03 · `pedidos/[id]/page.tsx:59` — Query ineficiente + posibles resultados incorrectos

**Archivo**: `src/app/(admin)/admin/pedidos/[id]/page.tsx:59`

```ts
const items = await db.select().from(orderItems).limit(500);
```

**Problema**:
- Trae TODAS las `orderItems` de la DB con un `LIMIT 500`. Si hay >500 items en total en TODOS los pedidos, se trunca silenciosamente.
- No filtra por `orderLineId` del pedido actual.
- Para pedidos viejos con muchas prendas, podría no mostrar el conteo correcto.

**Fix recomendado**:
```ts
// En la query de lines, hacer un subquery o join con orderItems
const items = await db
  .select()
  .from(orderItems)
  .innerJoin(orderLines, eq(orderItems.orderLineId, orderLines.id))
  .where(eq(orderLines.orderId, id));
```

**Impacto**: bajo a medio. No rompe build pero el conteo "X prendas" puede ser incorrecto.

---

## KI-04 · `pedidos/[id]/page.tsx:4` — Imports no usados (lint warning)

**Archivo**: `src/app/(admin)/admin/pedidos/[id]/page.tsx:4-10`

```ts
import { orders, orderLines, orderItems, payments, products, sizes, organizations, contacts, attachments, productionEvents } from "@/db/schema";
import { eq, desc, asc, sql } from "drizzle-orm";
import { ArrowLeft, Lock, ExternalLink, Plus, ShoppingCart, Image as ImageIcon, Receipt, FileText } from "lucide-react";
```

**Imports no usados** (verificar con `npm run lint`):
- `sizes` (no se usa en este archivo)
- `asc` (no se usa)
- `sql` (no se usa)
- `ShoppingCart` (no se usa)

**Fix**: eliminar imports no usados.

**Impacto**: warning en `next lint`, no rompe build.

---

## KI-05 · `pricing.ts:67-71` — Selección de receta "más específica" puede dar `undefined`

**Archivo**: `src/lib/pricing.ts:67-71`

```ts
const recipe =
  recipes.find((r) => r.sizeId === line.sizeId && r.techniqueId === (line.techniqueId ?? null)) ??
  recipes.find((r) => r.sizeId === line.sizeId) ??
  recipes.find((r) => r.techniqueId === (line.techniqueId ?? null)) ??
  recipes[0];
```

**Problema**:
- Si NO hay recetas para el producto, `recipes[0]` es `undefined` y la línea calcula `unitCost = 0`. La cotización devuelve 0 de costo sin advertencia.
- Comparar `r.techniqueId === null` cuando en Drizzle las columnas nullable se devuelven como `null`, pero la línea pasa `line.techniqueId ?? null` que sí es `null`. OK en la mayoría de casos.
- **No hay logging** cuando no se encuentra receta → el admin no se entera que le falta configurar el BOM.

**Fix recomendado**:
```ts
if (recipes.length === 0) {
  console.warn(`[pricing] Producto ${product.sku} sin recetas configuradas. Costo=0.`);
}
// Opcional: hacer la cotización FALLAR si no hay receta (más seguro para el negocio)
```

**Impacto**: alto. Una cotización sin costo = margen inflado = pérdida silenciosa de plata.

**Estado @fecha-2026-09-04**: mitigado — `src/lib/pricing.ts` ahora loguea `console.warn` con SKU cuando el producto no tiene recetas. No se hizo fallar la cotización (decisión: no romper F3-15; el seed F2-20 provee recetas demo).

---

## KI-06 · `pricing.ts:39-41` — Error genérico rompe toda cotización

**Archivo**: `src/lib/pricing.ts:39-41`

```ts
if (!activeRule) {
  throw new Error("No hay regla de pricing activa. Configurar en /admin/configuracion.");
}
```

**Problema**: la regla `/admin/configuracion` NO EXISTE aún (F2-17). Si no hay regla, el motor tira 500. Como tampoco hay seed, no hay regla activa → la app explota al primer intento de cotizar.

**Fix**: hasta que se implemente F2-17 + F2-18, agregar un fallback:
```ts
if (!activeRule) {
  // TEMPORAL: usar regla hardcoded hasta F2-18
  return runQuoteWithFallbackRule(input);
}
```

**Impacto**: bloqueante para F3-15.

---

## KI-07 · `app/layout.tsx:13-21` — `<head>` manual con `<link>` a Google Fonts

**Archivo**: `src/app/layout.tsx:13-21`

```tsx
<head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  ...
  <link href="https://fonts.googleapis.com/css2?family=..." rel="stylesheet" />
</head>
```

**Problema**:
- Next.js 15 / App Router tiene su propia forma de manejar fonts (`next/font/google`). Poner `<link>` manual en `<head>` es válido pero subóptimo.
- **CSP**: si después agregás Content-Security-Policy (KI-08), `style-src` y `font-src` deben incluir `fonts.googleapis.com` y `fonts.gstatic.com`.
- FOUT (flash of unstyled text) en la primera carga.

**Fix recomendado** (mejor práctica Next.js 15):
```ts
import { Inter, Space_Grotesk } from "next/font/google";
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-space" });
// y en el <html className={`${inter.variable} ${spaceGrotesk.variable}`}>
```

**Impacto**: bajo, funcional.

---

## KI-08 · `next.config.ts` — Sin headers de seguridad, sin CSP

**Archivo**: `next.config.ts`

```ts
const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};
```

**Problema**:
- No hay headers de seguridad (CSP, X-Frame-Options, X-Content-Type-Options, etc).
- F5-14 lo cubre pero el agente debe hacerlo antes de producción.

**Fix** (F5-14):
```ts
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: "..." },
];
```

**Impacto**: medio. Importante para producción, no rompe dev.

---

## KI-09 · Sin `seed.ts` — DB vacía al primer arranque

**Archivo**: `src/db/seed.ts` no existe.

**Problema**:
- F2-20 es la tarea de crear el seed.
- Sin seed, no hay admin user → no se puede loguear.
- Sin seed, no hay materiales/técnicas/productos → no se puede cotizar.
- El script `npm run db:seed` está en `package.json` pero apunta a un archivo inexistente → `tsx src/db/seed.ts` fallará con "Cannot find module".

**Fix**: implementar F2-20 (crear admin + org demo + 5 materiales + 3 técnicas + 4 productos + talles + recetas).

**Impacto**: bloqueante para probar CUALQUIER flujo de F3 en adelante.

---

## KI-10 · `db/client.ts` — `neon(placeholder)` crea conexión inválida en dev

**Archivo**: `src/db/client.ts`

```ts
const sql = neon(databaseUrl ?? "postgresql://placeholder");
```

**Problema**:
- En dev sin `DATABASE_URL` seteada, `neon("postgresql://placeholder")` crea un cliente con URL inválida. La primera query falla con error confuso de Postgres.
- Debería fallar rápido y explícito.

**Fix**:
```ts
if (!databaseUrl && process.env.NODE_ENV === "production") {
  throw new Error("DATABASE_URL is required in production");
}
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure Neon.");
}
const sql = neon(databaseUrl);
```

**Impacto**: bajo. Mensaje de error más claro.

---

## KI-11 · `auth.ts` — `createHmac` síncrono en request path

**Archivo**: `src/lib/auth.ts` (función `sign`)

**Problema**: `createHmac` es síncrono y bloquea el event loop. En alta concurrencia puede ser problema. No es bug actual porque la firma es de unos pocos bytes, pero podría optimizarse a `createHmac` con callback.

**Fix**: dejar para F6+ (optimización). No tocar.

**Impacto**: ninguno en MVP.

---

## KI-12 · `(admin)/admin/pedidos/[id]/page.tsx:160` — Link "/asignar-cliente" sin plan

**Archivo**: `src/app/(admin)/admin/pedidos/[id]/page.tsx:160`

```tsx
<Link href={`/admin/pedidos/${order.id}/asignar-cliente`} className="text-primary hover:underline">Asignar organización</Link>
```

**Problema**:
- Esta ruta NO está en el plan (ni F3 ni F5). Es un link a la nada.
- F3-06 (crear pedido nuevo) no incluye selección de cliente → el pedido se crea con `organizationId=null`.
- En la ficha del pedido NO hay forma de asignar cliente.

**Fix**: o bien (a) implementar la asignación en F3-07, o bien (b) eliminar el link hasta entonces.

**Impacto**: link roto.

---

## KI-13 · `npm run lint` roto a nivel toolchain (no es bug de código)

**Archivo**: `package.json` (script `lint: next lint`), sin config ESLint en raíz.

**Problema**:
1. `next lint` está deprecado en Next 15 y pide configuración **interactiva** (cuelga en CI/agentes).
2. Crear `eslint.config.mjs` flat con `eslint-config-next` falla: esa versión usa `@rushstack/eslint-patch`, incompatible con el ESLint 9 instalado (`Failed to patch ESLint because the calling module was not recognized`).

**Fix recomendado** (F5, tooling): alinear matriz de versiones (ESLint + eslint-config-next compatibles) o migrar al CLI oficial según `npx @next/codemod@canary next-lint-to-eslint-cli`. Hasta entonces, el gate de calidad es `npm run typecheck` + `npm run build` EXIT 0.

**Impacto**: 🟡 BAJA. No afecta runtime ni build. Verificado @fecha-2026-09-04.

---

## Resumen de impacto

| ID | Severidad | Bloquea F2? | Bloquea F3? |
|----|-----------|-------------|-------------|
| KI-01 | 🔴 ALTA | Sí (rompe build) | — |
| KI-02 | 🟠 MEDIA | No (UX) | Sí (UX bloqueante al probar) |
| KI-03 | 🟡 BAJA | No | No |
| KI-04 | 🟡 BAJA | No (lint warning) | — |
| KI-05 | 🔴 ALTA | No | Sí (cotización rota) |
| KI-06 | 🔴 ALTA | No | Sí (cotización rota) |
| KI-07 | 🟡 BAJA | No | No |
| KI-08 | 🟠 MEDIA | No (para dev) | No |
| KI-09 | 🔴 ALTA | Sí (F2-20) | — |
| KI-10 | 🟡 BAJA | No | No |
| KI-11 | 🟢 NINGUNA | No | No |
| KI-12 | 🟠 MEDIA | No (link roto) | Sí |

**Críticos a arreglar antes de F2**: KI-01, KI-09 (F2-20).  
**Críticos a arreglar antes de F3**: KI-05, KI-06, KI-12.

---

## Cómo verifiqué estos issues

- Leí completo `src/app/(admin)/layout.tsx` (104 líneas)
- Leí completo `src/app/(admin)/admin/pedidos/[id]/page.tsx` (258 líneas)
- Leí completo `src/lib/pricing.ts` (165 líneas)
- Leí completo `src/app/layout.tsx` (23 líneas)
- Leí completo `src/db/client.ts` (en sesión previa)
- Listé archivos: 39 archivos `.ts`/`.tsx` en `src/`

**NO ejecuté** `npm install`, `npm run build`, `npm run dev`, ni `npm run typecheck`. Los issues KI-01, KI-05, KI-06 son **inferidos por lectura del código**, no por error de compilador. Validar al arreglar.