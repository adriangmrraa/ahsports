# 06 · STANDARDS BUILDING — Reglas de código

> Reglas obligatorias para mantener coherencia entre devs/agentes. Aplican a TODO archivo `.ts` / `.tsx` del repo.

## A. Naming

| Tipo | Convención | Ejemplo |
|------|-----------|---------|
| Carpetas | kebab-case | `admin/pedidos/[id]/planilla/` |
| Componentes | PascalCase | `KanbanBoard.tsx` |
| Funciones | camelCase | `quoteOrder()` |
| Variables | camelCase | `totalQuoted` |
| Constantes | UPPER_SNAKE | `SESSION_COOKIE` |
| Tipos / Interfaces | PascalCase | `PricingSnapshot` |
| Enums DB | lower_snake | `bloqueado_pago` |
| Enums TS (Drizzle) | camelCase autogenerado | `BloqueadoPago` |
| Rutas API | kebab-case | `/api/pricing-rules` |
| Server actions | prefijo de dominio + verbo | `createOrder`, `quoteOrderAction`, `registerPayment` |
| Hooks | prefijo `use` | `useTransition` |

## B. Imports

| Regla | Detalle |
|-------|---------|
| Path alias | `@/` apunta a `src/` |
| Orden | 1. externos · 2. `@/lib/*` · 3. `@/db/*` · 4. `@/components/*` · 5. relativos (`./`, `../`) |
| Nunca | `import * as X` salvo para namespaces reales |
| Server-only | agregar `import "server-only"` al inicio de archivos que NO deben llegar al cliente |

## C. Estructura de archivos

### Página server component
```tsx
// src/app/(admin)/admin/pedidos/page.tsx
import { db } from "@/db/client";
import { PageHeader, Card } from "@/components/ui/Card";

export default async function PedidosPage() {
  const rows = await db.select().from(pedidos);
  return <>...</>;
}
```

### Página client component (convención)
```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function KanbanBoard({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);
  return <>...</>;
}
```

### API route
```ts
// src/app/api/orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await requireUser();
  // ...
  return NextResponse.json({ ok: true });
}
```

### Server action
```ts
"use server";
import { z } from "zod";
import { db } from "@/db/client";

const Schema = z.object({ name: z.string().min(1) });

export async function createMaterial(input: unknown) {
  const data = Schema.parse(input);
  // ...
}
```

## D. Componentes UI

| Regla | Detalle |
|-------|---------|
| `'use client'` | Solo si hay state, eventos, effects. Default = server component |
| Named exports | `export function Button()` NO `export default` |
| Props tipadas | `interface ButtonProps { variant?: Variant; ... }` o `type` |
| `className` siempre al final | Permite override |
| `cn()` para combinar | `cn("base", conditional && "extra", className)` |
| Cero hex colors inline | Solo CSS vars: `bg-surface`, `text-primary`, `border-outline-variant` |

## E. Estilos

| Regla | Detalle |
|-------|---------|
| Solo Tailwind | Sin CSS modules, sin styled-components |
| Tokens semánticos | `bg-surface`, `text-on-surface`, `border-outline-variant`, `text-primary` |
| Spacing | múltiplos de 4px (`p-2`, `p-4`, `p-6`) |
| Radius | `rounded-sm`, `rounded-md`, `rounded-lg` (no `rounded-xl`) |
| Tipografía | `font-headline` (Space Grotesk) para títulos, `font-body` (Inter) por defecto |
| Sin emojis | (excepto si el usuario los pide explícitamente) |
| Sin comentarios en código | Solo cuando son no obvios Y el usuario los pide |

## F. Base de datos

| Regla | Detalle |
|-------|---------|
| UUIDs | `varchar("id", { length: 36 }).default(sql\`gen_random_uuid()\`)` |
| Timestamps | `timestamp("created_at", { withTimezone: true }).notNull().defaultNow()` |
| Money | `numeric("amount", { precision: 12, scale: 2 })` o `numeric(14, 2)` para totales |
| Boolean | `boolean("active").notNull().default(true)` para soft-delete |
| FK | siempre con `references()` y definir `onDelete` (cascade / set null / restrict) |
| Indices | agregar en columnas de FK y de búsqueda frecuente |
| Enums | `pgEnum("name", [...])` y exportar para uso en código |
| Relations | `relations()` define shape para queries con `with` |

## G. Server / API / Actions

| Regla | Detalle |
|-------|---------|
| Validación | SIEMPRE con Zod (`Schema.parse(input)` o `.safeParse`) |
| Auth | `requireUser()` (todas las rutas excepto `/login`, `/api/auth/login`, `/api/public/*`) |
| Errores | códigos HTTP correctos: 400 (input), 401 (auth), 404 (no existe), 409 (conflicto), 500 (server) |
| Errores en body | `{ error: string }` |
| Logging | `console.error` en catches. En producción, integrar Pino o similar (F6+) |
| Sin secrets al cliente | NUNCA `process.env.SECRET` en código que llegue al bundle |

## H. Git

| Regla | Detalle |
|-------|---------|
| Commits | Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:` |
| Scope | `(admin)`, `(api)`, `(db)`, `(auth)`, `(ui)` |
| Sin Co-Authored-By IA | Regla global del usuario |
| Branch | `main` para producción. Branches por fase: `feat/f3-pedidos`, etc. |
| Antes de commit | `npm run lint && npm run typecheck && npm run build` EXIT 0 |

## I. Verificación por fase

Antes de marcar tareas `[x]` en `BUILD_PROGRESS-F<N>.md`:
1. `tsc --noEmit` EXIT 0
2. `npm run lint` EXIT 0 (configurado por `eslint-config-next`)
3. `npm run build` EXIT 0 (si la fase agrega rutas/páginas)
4. `npm run dev` levanta y la ruta crítica responde 200 (con `curl` o navegador)
5. Si la tarea toca DB: `npm run db:studio` confirma persistencia visual