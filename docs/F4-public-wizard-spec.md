# SDD — F4-07..13: Presupuesto público (wizard 5 pasos)

Fase: F4 · Estado: `- [ ] F4-07..F4-13`

## What (problema)
El cliente externo debe poder pedir un presupuesto sin login: recorrer 5 pasos
(tipo+contacto → producto+talles → personalizaciones → archivos → confirmación),
que al confirmar crea pedido real en DB con `publicToken` único y enlaza contactos/
organización. Ref: Stitch `solicitud_presupuesto_paso_1..5` + PARITY-INVENTORY §17-23.

## Spec (criterios de aceptación, del BUILD_PROGRESS-F4)
1. **F4-07** `(public)/layout.tsx` (header simple + footer, sin sidebar, cero hex) + `/presupuesto` → redirect `/presupuesto/1`. GET /presupuesto → 307.
2. **F4-08** Paso 1 `/presupuesto/1`: tipo (nuevo|existente), name/email/phone (required), organizationName (opcional), notes. **Estado en URL search params** (`?type=&name=&email=...`). Si "ya soy cliente" + email matchea contact → autollenar.
3. **F4-09** Paso 2 `/presupuesto/2`: carga `products` activos (cards) + `sizes` por producto (grilla) + input cant por talle → `?productId=&sizeQuantities=S:2,M:3`.
4. **F4-10** Paso 3 `/presupuesto/3`: por cada prenda (qty total) fila con talle + nombre + número → `?lineItems=...`.
5. **F4-11** Paso 4 `/presupuesto/4`: cards con file input + Select kind + ubicación; `uploadAttachmentFromPublic(formData, publicToken)` (NO requiere orderId aún) → `?files=ids`.
6. **F4-12** Paso 5 `/presupuesto/5`: server action `createPublicOrder(allParams)` — transacción: upsert org (por name) + contact (por email) + order (status borrador, publicToken unique) + orderLine (unitPrice 0, quoteOrder calcula) + orderItems (1 por prenda) + asociar attachments (UPDATE attachments SET orderId). Mostrar resumen + link `/seguimiento/[token]`.
7. **F4-13** Mobile responsive transversal (flex-col mobile, md:grid desktop).

## Design
- `src/app/(public)/presupuesto/[1..5]/page.tsx` (server components) + `src/app/(public)/presupuesto/_components/` (forms client).
- Server actions: `src/app/actions/public-orders.ts` (createPublicOrder, uploadAttachmentFromPublic).

## Anti-invención
Precios: unitPrice=0 inicial — se calcula con quoteOrder() real (pricing.ts, sin inventar). Código pedido AH-YYYY-NNNN (no random Math). Contacto/org por upsert real en DB. publicToken por randomBytes/crypto (no Math.random).

## How to verify
- `npx tsc --noEmit` exit 0.
- GET /presupuesto → 307; completar 5 pasos con seed → pedido con publicToken; seguimiento responde.
- Mark F4-07..13 `[x]@2026-09-04` tras verificación.