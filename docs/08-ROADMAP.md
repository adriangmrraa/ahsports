# 08 · ROADMAP — Post-MVP

> Mejoras planeadas después de entregar F0-F5. Priorizadas por valor para el taller.

## Q1 post-MVP

### 🟠 Mockup 2D / personalizador visual
**Por qué**: el relevamiento (§7 Etapa 3) lo menciona como siguiente paso lógico. Permite al cliente ver el diseño aplicado a una silueta de la prenda antes de aprobar.
**Stack sugerido**: Canvas/SVG en frontend, sin backend adicional. Zonas ya configuradas en `products.zones` son la entrada.
**Complejidad**: media-alta. Depende de assets SVG por producto.

### 🟠 Generación automática de arte final
**Por qué**: hoy el diseño es manual. Generar variantes de color/composición automáticamente aceleraría el ciclo.
**Stack sugerido**: API externa (Ideogram, OpenAI gpt-image-1, o Gemini). Cachear resultados en Storage.
**Complejidad**: alta. Requiere storage real + integración API + UX de aprobación.

### 🟠 Notificaciones por WhatsApp al cliente
**Por qué**: el seguimiento público cubre la consulta activa, pero muchos clientes quieren push.
**Stack sugerido**: WhatsApp Business API (o YCloud como en Fusa Labs). Webhook a `/api/webhook/whatsapp/inbound`.
**Complejidad**: alta. Requiere cuenta verificada + plantillas Meta aprobadas.

## Q2 post-MVP

### 🟠 Inventario real por lote
**Por qué**: hoy el stock está implícito en el cálculo de materiales. Llevar cuenta real permite alertas de faltantes.
**Cambios DB**: tabla `inventory_lots` (materialId, qty, location, expiresAt, supplierLot). Cada pedido consume al pasar a `corte`.
**Complejidad**: media.

### 🟠 Compras y alertas de faltante
**Por qué**: derivado del inventario. Cuando un pedido activo consume más de lo disponible, generar orden de compra sugerida al proveedor.
**Cambios DB**: `purchase_orders`, `supplier_orders`.
**Complejidad**: media.

### 🟠 Reportes de margen real vs costo estimado
**Por qué**: hoy `orders.marginPercent` es la diferencia precio-costo al cotizar. El real puede variar por mermas reales, desperdicio, etc.
**Cambios**: registrar `actual_cost` al entregar (lo carga el operario o admin) y comparar.
**Complejidad**: baja. Solo UI + endpoint.

## Q3 post-MVP

### 🟠 Multi-taller (multi-tenant)
**Por qué**: si en el futuro se quisiera ofrecer la plataforma a otros talleres, hay que rediseñar el schema con `tenantId` en TODAS las tablas + RLS.
**Cambios DB**: agregar `tenantId` a 19 tablas + policies + migración de datos.
**Complejidad**: alta. Rompe compatibilidad con deployments existentes.

### 🟠 Bot de WhatsApp conversacional
**Por qué**: el relevamiento lo menciona. Bot que responde preguntas frecuentes, da estado de pedido, agenda consulta.
**Stack**: similar a Fusa Labs (`whatsapp_service` Python) o Mastra AI con tools.
**Complejidad**: alta.

### 🟠 Mockup 2D avanzado
Extensión del mockup básico: variantes de color automáticas, exportar a PDF/PNG, compartir link.

## Backlog sin fecha

- Versionado de recetas (cam bios de BOM dejan rastro histórico)
- Importación CSV de planillas de talles
- Exportación PDF de presupuestos para enviar por mail
- App móvil nativa para operarios (hoy es web responsive)
- Integración con Mercado Pago para señas online
- Temas light/dark
- i18n (es/en)
- Audit log de cambios sensibles (cambios de precios, reglas, borrados)