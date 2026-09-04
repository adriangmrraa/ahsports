# 04 · BUSINESS RULES — Lenguaje del dominio y reglas operativas

> Vocabulario del taller, fórmulas de cotización, máquina de estados, criterios de bloqueo.

## 1. Lenguaje del dominio

| Concepto | Definición |
|----------|------------|
| **Organización** | Club, empresa, colegio, institución o particular que realiza pedidos recurrentes. Tabla: `organizations` |
| **Contacto** | Persona que habla con AH Sports: capitán, gerente, delegado, madre/padre. Tabla: `contacts` (FK opcional a `organizations`) |
| **Pedido** | Compromiso comercial. Tiene productos, arte, planilla, precios, pagos, producción. Tabla: `orders` |
| **Línea de pedido** | Un producto/variante dentro del pedido, ej: 22. camisetas sublimadas. Tabla: `orderLines` |
| **Prenda individual** | Una unidad identificable cuando necesita talle, nombre, número o estado propio. Tabla: `orderItems` |
| **Activo gráfico** | Archivo reutilizable: escudo, logo institucional, sponsor, marca, diseño. Tabla: `attachments` con `kind=identidad_organizacion` o `sponsor` |
| **Adjunto del pedido** | Evidencia o insumo documental: artes, referencias, listas, comprobantes. Tabla: `attachments` con `orderId` |
| **Ubicación de prenda** | Zona física a intervenir: pecho izquierdo, manga derecha, espalda alta. Tabla: `applications.zone` (texto libre validado contra `products.zones` array) |
| **Técnica** | Método de aplicación: sublimación, DTF, bordado, serigrafía, vinilo. Tabla: `techniques` |
| **Ficha técnica / Receta (BOM)** | Configuración que describe cómo un producto se cotiza y consume insumos. Tablas: `bomRecipes` + `bomItems` |

## 2. Tipos de adjunto (enum `attachmentKind`)

| Valor | Alcance habitual | Ejemplos |
|-------|------------------|----------|
| `identidad_organizacion` | Organización | escudo, logo institucional, manual de marca |
| `sponsor` | Organización o pedido | sponsor de manga, publicidad de espalda |
| `diseno_pedido` | Pedido / línea | boceto, referencia, arte final, mockup aprobado |
| `personalizacion_individual` | Prenda individual | nombre, número, insignia |
| `documento_operativo` | Pedido | planilla de talles, comprobante, orden de compra |
| `produccion_calidad` | Pedido / prenda | prueba de color, foto de muestra, control final |

## 3. Estados de adjunto (enum `attachmentStatus`)

| Valor | Significado | Quién lo setea |
|-------|-------------|----------------|
| `pendiente_revision` | Cargado, esperando visto bueno | Sistema al subir |
| `aprobado` | Listo para producción | Diseñador/admin |
| `requiere_reemplazo` | Versión no usable, pedir nueva | Diseñador/admin |
| `rechazado` | Inutilizable, archivar | Diseñador/admin |
| `archivado` | Fuera del set activo | Sistema/admin |

## 4. Máquina de estados de pedido (enum `orderStatus`)

```
borrador
  → presupuesto_enviado
    → aprobado
      → seniado
        → en_produccion
          → corte
            → confeccion
              → estampado
                → control
                  → entregado
cualquiera → bloqueado_pago (auto, si pagos < minAdvance%)
cualquiera → cancelado (manual)
```

**Reglas**:
- `bloqueado_pago` se asigna automáticamente al cotizar si los pagos registrados son menores a `totalQuoted * pricingRule.minAdvancePercent / 100`.
- Se quita automáticamente cuando un nuevo pago cubre el mínimo.
- `en_produccion` solo es alcanzable si `status ∈ {aprobado, seniado}` Y pagos >= mínimo (no está bloqueado).
- `corte / confeccion / estampado / control` se asignan desde el Kanban drag-and-drop o desde cambios manuales con justificación.

## 5. Máquina de estados de prenda individual (enum `productionStage`)

```
ingreso → corte → confeccion → estampado → control → entrega
```

Una prenda puede saltarse etapas (ej: sublimado en una tela sin corte). El Kanban de pedido opera a nivel pedido, no prenda.

## 6. Motor de cotización (función `quoteOrder()`)

Implementado en `src/lib/pricing.ts`.

### Inputs
```ts
{
  lines: Array<{
    productId: string;
    quantity: number;
    sizeId?: string | null;
    techniqueId?: string | null;
    overrideUnitPrice?: number | null;  // admin puede override manual
  }>;
  urgent?: boolean;
  pricingRuleId?: string;
}
```

### Algoritmo (por línea)

1. Buscar producto (404 si no existe).
2. Si `techniqueId`, buscar técnica (404 si no existe).
3. Buscar receta más específica:
   - `(sizeId + techniqueId)` exacto → si no
   - `(sizeId)` solo → si no
   - `(techniqueId)` solo → si no
   - general (sin size ni technique)
4. Para cada `bomItems` de la receta:
   ```
   qtyWithWaste = bomItem.quantity * (1 + bomItem.wastePercent/100)
   cost += qtyWithWaste * material.unitPrice
   ```
5. Sumar `technique.costPerUnit + technique.setupCost`.
6. `unitPrice = (override ?? product.basePrice) * (1 + urgent ? urgentSurcharge/100 : 0)`
7. `subtotal = unitPrice * quantity`

### Totales
```
cost = Σ(unitCost * quantity)
price = Σ(subtotal)
margin = price - cost
marginPercent = margin / price * 100
```

### Snapshot persistido

```ts
{
  rule: { name, marginPercent, urgentSurcharge, minAdvancePercent },
  lines: [{ productName, quantity, unitCost, unitPrice, subtotal, materials: [...] }],
  totals: { cost, price, margin, marginPercent },
  generatedAt: ISO string,
}
```

El snapshot se guarda en `orders.snapshot jsonb` inmutable. Re-cotizar genera un nuevo snapshot (no pisa).

## 7. Reglas de bloqueo por seña

```ts
const minAdvance = order.totalQuoted * (pricingRule.minAdvancePercent / 100);
const paid = sum(payments.amount where !cancelled);
const blocked = order.totalQuoted > 0 && paid < minAdvance;
if (blocked && order.status !== "bloqueado_pago") {
  order.status = "bloqueado_pago";
}
if (!blocked && order.status === "bloqueado_pago") {
  // desbloquear solo si status era bloqueado_y_aún_no_producción
  if (order.status_anterior ∈ {borrador, presupuesto_enviado, aprobado}) {
    order.status = "aprobado";  // o el que tuviera antes
  }
}
```

## 8. Estimación de materiales

**Por pedido**:
```
Σ (consumo unitario por talle × cantidad) × (1 + merma)
```

**Conversión kilo → metros**:
```
kilos = metros ÷ rendimiento_en_metros_por_kilo
```

**Prendas posibles desde material disponible**:
```
piso(metros útiles ÷ consumo unitario con merma)
```

## 9. Permisos por rol (enum `userRole`)

| Rol | Puede |
|-----|-------|
| `admin` | TODO |
| `gerencia` | TODO (incluye cambiar reglas de pricing) |
| `disenador` | Editar productos, revisar/aprobar arte, configurar recetas y técnicas |
| `operario` | Solo ver pedidos asignados, avanzar etapas en Kanban, ver ficha técnica, NO editar precios ni borrar pedidos |

## 10. Reglas operativas

1. **Sin archivo aprobado no hay producción.** Si una `application` apunta a un `attachment` con `status != aprobado`, el sistema bloquea el avance a `corte` con un warning (no hard-stop, depende del taller).
2. **Cambio de precio NO afecta pedidos viejos.** Por eso el snapshot.
3. **Toda mutación sensible (precios, reglas, borrados) queda en `productionEvents` o audit log futuro.**
4. **El operario NO ve costos ni márgenes**, solo planilla, aplicaciones y materiales a consumir.