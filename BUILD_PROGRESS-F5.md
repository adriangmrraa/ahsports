# ⏳ F5 — Caja + Pagos + Configuración + Render deploy + Cierre

> **Propósito**: cerrar las pantallas de caja y pagos, terminar la página de configuración con reglas y snapshot del cálculo, y dejar todo deployable en Render con Neon.
>
> **Estado al 2026-09-05**: 🟢 EN CURSO — 2/16 (F5-03, F5-04 + backend pagos F5-05/F5-06: actions + API POST/DELETE con recálculo atómico). Migración `0002_payment_cancellation_audit` + `src/lib/payments.ts` como servicio compartido. Resto pendiente: caja (F5-01/02), config (F5-07/08), deploy (F5-09..13), hardening (F5-14/15), cierre (F5-16). **CÓDIGO NO ESCRITO** para esos grupos.

---

## A. Caja y saldos

- [ ] **F5-01** Página `/admin/caja` — Saldos por organización.
  - Carga: agregación `db.select({orgId: orders.organizationId, totalQuoted: sum(orders.totalQuoted), totalPaid: sum(payments.amount)}).from(orders).leftJoin(payments, eq(payments.orderId, orders.id)).where(not(isNull(orders.organizationId))).groupBy(orders.organizationId)`
  - Para cada org: nombre + total cotizado + total pagado + saldo (deuda)
  - Join con `organizations` para nombre
  - Tabla ordenable por saldo descendente (deudores primero)
  - Click en org → `/admin/caja/[organizationId]`
  - Verificar: con seed (1 org, 0 pedidos) muestra "Club Renacer $0".

- [ ] **F5-02** Página `/admin/caja/[organizationId]` — Cuenta corriente detallada.
  - Carga: org + orders (todos) + payments (todos) ordenados cronológicamente
  - Timeline: eventos como "Pedido #415 creado: $8500", "Seña registrada: $4250", "Pago: $2000", etc.
  - Totales: cotizado, pagado, saldo
  - Lista de pedidos abiertos con link a ficha
  - Verificar: con datos seed, ver timeline.

## B. Pagos

- [x] **F5-03** Página `/admin/pagos` — Listado global de pagos. **VERIFICADO 2026-09-05**: `src/app/(admin)/admin/pagos/page.tsx` — filtros kind/method/rango fechas + checkbox incluir-cancelados, join a orders.number y organizations.name, total de activos al pie, cancelados tachados. typecheck+build EXIT 0 (40 rutas).
  - Carga: payments con join a orders.number y organizations.name
  - Filtros: rango de fechas (dateFrom, dateTo), method (chips), kind (chips), organización (input)
  - Tabla: fecha, orden (#), organización, kind, method, amount, reference
  - Totales al pie: suma filtrada
  - Verificar: con seed vacío, empty state.

- [x] **F5-04** Página `/admin/pedidos/[id]/pagos` — Pagos del pedido + form alta. **VERIFICADO 2026-09-05**: `pagos/{page.tsx,PagosForms.tsx}` + `src/app/actions/payments.ts` (registerPayment/cancelPayment con requireUser+Zod+withDbTransaction) + `src/lib/payments.ts` (centavos enteros, gate bloqueado_pago↔aprobado, eventos inmutables). StatCards cotizado/pagado/saldo/falta-seña; cancelados no cuentan. typecheck+build EXIT 0.
  - Carga: payments del pedido + totales (cotizado, pagado, saldo, faltaSena)
  - Form "Registrar pago": kind (Select: sena|pago|saldo), method (Select: efectivo|transferencia|cheque|mercadopago|otro), amount (number, required, min 0.01), reference (text, opcional), notes (textarea, opcional)
  - Lista de pagos existentes con botón "Cancelar" (soft-delete via `cancelled=true`)
  - Server action `registerPayment(orderId, formData)`:
    1. `requireUser`
    2. Zod: `{kind: z.enum(["sena","pago","saldo"]), method: z.enum([...]), amount: z.number().positive(), reference?: string, notes?: string}`
    3. Validar order existe
    4. Insert `payments` con `orderId, createdById: user.id`
    5. **Recalcular bloqueo** (KI-06 + F3-21):
       - Si `pagos.total + amount >= order.totalQuoted * rule.minAdvancePercent / 100` Y `order.status === 'bloqueado_pago'`:
         - Cambiar status a `aprobado` (o el que tenía antes del bloqueo — guardar previousStatus en metadata si se quiere refinar)
         - Loggear el desbloqueo
  - Verificar: registrar seña de $4250 sobre pedido cotizado en $8500 → status cambia de bloqueado_pago a aprobado.

- [x] **F5-05** API `POST /api/payments` — Crear pago con recálculo de bloqueo. **VERIFICADO 2026-09-05**: `src/app/api/payments/route.ts` — misma `registerPaymentTx` reutilizable que la action. build EXIT 0.
  - Mismo comportamiento que F5-04 server action
  - Zod validation
  - **CRÍTICO**: encapsular la lógica de recálculo de bloqueo en una función `recalculateBlockStatus(orderId, db)` reutilizable
  - Verificar: API + recálculo.

- [x] **F5-06** API `DELETE /api/payments/[id]` — Cancelar pago (soft). **VERIFICADO 2026-09-05**: `src/app/api/payments/[id]/route.ts` — `cancelPaymentTx` + recálculo (puede re-bloquear). build EXIT 0.
  - Update `payments.cancelled = true` + `cancelledAt = now()` + `cancelledBy = user.id`
  - Recalcular bloqueo (puede volver a bloquear si el saldo restante < mínimo)
  - Verificar: cancelar un pago que generaba desbloqueo → status vuelve a bloqueado.

## C. Configuración general

- [ ] **F5-07** Página `/admin/configuracion` — Hub con todas las reglas.
  - Server component carga: `pricingRules`, `settings` (key-value)
  - Layout: secciones colapsables (accordion o tabs)
  - Secciones:
    1. **Reglas de precio**: tabla + form de alta/edición (F2-17, integrado acá)
    2. **Datos del taller**: form con `settings.taller_nombre`, `taller_cbu`, `taller_contacto_email`, `taller_contacto_phone`, `taller_direccion`
    3. **Notificaciones** (placeholder, no funcional): info "Próximamente: integración con WhatsApp Business"
    4. **Storage** (info): muestra si está usando local o S3
    5. **Snapshots de pricing** (info): lista de los últimos N snapshots globales (de orders.snapshot.generatedAt)
  - Verificar: render limpio, cada sección con su form funcional.

- [ ] **F5-08** Server action `updateSetting(key, value)` — Upsert en `settings`.
  - Zod: `key: z.string().min(1).max(128), value: z.any()` (jsonb arbitrario)
  - Lógica: `INSERT ... ON CONFLICT (key) DO UPDATE`
  - Verificar: cambiar `taller_nombre` → reload → muestra el nuevo valor.

## D. Deploy en Render

- [ ] **F5-09** `render.yaml` declarativo.
  - Contenido:
    ```yaml
    services:
      - type: web
        name: ah-sports-os
        runtime: node
        plan: starter
        buildCommand: npm install && npm run db:push && npm run build
        startCommand: npm start
        envVars:
          - key: NODE_VERSION
            value: 22
          - key: DATABASE_URL
            sync: false  # set manually from Neon
          - key: SESSION_SECRET
            generateValue: true
          - key: NODE_ENV
            value: production
        healthCheckPath: /
    ```
  - Verificar: `render.yaml` es YAML válido y se sube a Render sin errores.

- [ ] **F5-10** README actualizado con sección "Deploy en Render" detallada.
  - Pasos: crear Neon, copiar DATABASE_URL, crear Web Service en Render apuntando a este repo, setear env vars, primer deploy, ejecutar `npm run db:seed` desde Render shell, cambiar password admin
  - **CRÍTICO**: incluir troubleshooting común (DB no migrada, SESSION_SECRET cambia entre deploys, etc.)
  - Verificar: instrucciones exactas, sin ambigüedades.

- [ ] **F5-11** Verificar `npm run build` de PRODUCCIÓN.
  - Ejecutar con `NODE_ENV=production npm run build` y verificar EXIT 0
  - Si falla: típicamente por imports que asumen Node.js APIs en client components, o por tipos faltantes
  - Verificar: build artifacts en `.next/`

- [ ] **F5-12** Verificar que la app arranca con `npm start` y responde 200 en `/`.
  - Después del build, `npm start` en background, `curl http://localhost:3000/` → 200
  - `curl http://localhost:3000/login` → 200
  - `curl http://localhost:3000/admin` → 307 (redirect a /login por requireUser)
  - Verificar: smoke test completo.

- [ ] **F5-13** `Dockerfile` alternativo (no necesario para Render con native build, pero tenerlo como fallback).
  - Multi-stage: build con `node:22-alpine`, deps separadas dev/prod
  - Verificar: `docker build . && docker run` arranca la app.

## E. Endurecimiento mínimo

- [ ] **F5-14** Headers de seguridad en `next.config.ts`.
  - Agregar `headers()` async function con:
    - `X-Frame-Options: DENY`
    - `X-Content-Type-Options: nosniff`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Permissions-Policy: geolocation=(), microphone=(), camera=()`
    - `Content-Security-Policy`: default-src 'self'; img-src 'self' data: https://*.googleusercontent.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'
  - Verificar: `curl -I http://localhost:3000/` muestra los headers.

- [ ] **F5-15** Rate limiting básico en `/api/auth/login`.
  - Implementar con un Map en memoria (suficiente para MVP single-instance) o un middleware simple
  - 5 requests/minuto por IP, devolver 429 si excede
  - Verificar: 6 logins en 1 min → 6to devuelve 429.

## F. Cierre del proyecto

- [ ] **F5-16** Marcar F5 completa + marcar proyecto como "production-ready" en `BUILD_PROGRESS.md`.
  - Actualizar índice con totales finales
  - Crear `RELEASE-NOTES.md` con resumen de features, screenshots opcionales, y pasos para retomar
  - Actualizar `PENDIENTES.md` con lo que quedó para iteraciones futuras
  - Verificar: progreso total y entregables documentados.

---

## Resumen F5

- Tareas: 16 · Completadas: 0 · Pendientes: 16
- 6 grupos: A (Caja 2) · B (Pagos 4) · C (Config 2) · D (Deploy 5) · E (Hardening 2) · F (Cierre 1)
- Salida esperada: app production-ready, deployada en Render, con caja+pagos+configuración operativas y endurecimiento mínimo de seguridad.
- Dependencias: F2 (regla pricing), F3 (pedidos con snapshot), F4 (no requiere)
- Esta fase cierra el MVP. Después de F5 el sistema está en producción funcional.