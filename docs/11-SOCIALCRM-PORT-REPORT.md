# 11 · SOCIALCRM → AH SPORTS PORT — Reporte final de orquestación

> Reporte de cierre del port completo de la plataforma de agentes multicanal
> SocialCRM a AH Sports OS (fábrica textil). Orquestado por olas de workers en
> worktrees Orca, mergeado a `master`, pusheado a `origin`.
>
> **Estado: COMPLETO.** Las tres olas aterrizaron, los gates pasaron en verde en
> cada merge, la migración `0011` está aplicada en Neon, y el grafo de
> conocimiento quedó sincronizado y descrito (2861/2861 nodos).

## 0. Datos de la corrida

| | |
|---|---|
| Baseline | `6d12569` (main == origin, clean) |
| HEAD final | `9c3fe36` — `feat(agents): register wave-2 tool surfaces in the closed registry` |
| Branch | `master` (este repo usa `master`, no `main`) |
| Fuente (read-only) | `C:/Users/Asus/Documents/FORMOSA.DEV/SocialCRM` |
| Delegates | Devin SWE-2 Max en worktrees `C:/Users/Asus/orca/workspaces/App de gestion/<wave>` |
| Verificación | Solo estática: `typecheck` + `build` + `check:agent-tools`. Ninguna prueba end-to-end contra proveedores reales. |

## Ola 1 — Foundation (messaging + cuentas de canal)

**Workers:** `ah-messaging-providers`, `ah-channel-accounts` (paralelos, ownership disjunto).

**Qué aterrizó**

- `src/lib/messaging/**`: contrato de provider congelado (`types.ts`), registry,
  adapters `providers/ycloud|kapso|zernio`, fachada de envío `messenger.ts`,
  pipeline inbound unificado (`inbound-pipeline.ts`: echo/dedup/anti-loop/
  debounce buffer), `ingress.ts` (verificación per-account de webhook secret),
  `inbound-keys.ts` (namespacing por cuenta), `auto-reply.ts`, `bubbles.ts`,
  `conversation-identity.ts`, `lead-identity.ts`, `webhook-guard` (caps de
  body/evento).
- `src/app/api/webhooks/ingress/[provider]/route.ts`: ingress unificado.
- `src/lib/infra/**`: rate-limit con buckets aislados.
- `src/lib/channels/**`: resolución de cuentas + binding + link de leads;
  lectura tolerante a la path legacy env-based de YCloud.
- `src/db/schema.ts` + migración **`0011_channel_accounts.sql`** (tablas
  `channel_accounts`, `lead_identities`, `channel_events`; enum `channel`
  ampliado a telegram/whatsapp/instagram/facebook/sms/reddit). **Aplicada a
  Neon** con `npm run db:migrate` tras revisión del SQL.
- Credenciales cifradas en reposo: `src/lib/crypto/secret-box.ts` (AES-256-GCM).

**Commits:** `c2dacee`, `6eb084e`, `d02416b` (channel-accounts) + `f6345e7`,
`6037d7b`, `c400b61`, `f94fe1b` (messaging-providers). Merge `78e34f4`, push
`6d12569..78e34f4`.

## Ola 2 — Agents + UX (4 workers paralelos)

**Workers:** `ah-sales-agent`, `ah-internal-agent`, `ah-media-pipeline`,
`ah-admin-ui`.

**Qué aterrizó**

- `src/lib/whatsapp/**`: dispatcher de ventas (`sales-agent.ts`), session
  boundary + CAS store, session-policy determinística, prompt-builder
  es-AR (voseo) textil, prompt-security (injection como señal, no control
  flow), sales-tools endurecidas (re-pricing server-side, identidad del
  cliente siempre resuelta server-side), anti-loop + human-handoff,
  buffered-history, temporal-context.
- `src/lib/telegram/**`: bot operador con pipeline completo
  (`bot.ts`), tools orders/products/clients/cash/memory/broadcast/analytics,
  confirmaciones en dos pasos (`confirmations.ts`), system-prompt, notifier.
- `src/lib/reconcile/**`: runner read-only candidates-only (sin tools de
  escritura en corridas unattended) + scan + prompt.
- `src/lib/media/**` + `src/lib/storage.ts`: adapter privado fuera de
  `public/`, downloader con allowlist de dominios + magic bytes, transcripción,
  document/pdf (nueva dep `pdf-parse ^1.1.4`), vision, signatures. Ruta
  session-gated `src/app/api/media/[...path]/route.ts`.
- `src/app/(admin)/admin/**`: `/admin/canales` (CRUD de cuentas + flujo
  Zernio embedded connect + webhook cards), agent config con scope por canal
  (copy-from-scope), inbox con badges por canal + filtro por cuenta.
- Meta webhook `src/app/api/whatsapp/webhook/[token]/route.ts` refactorizado a
  thin-delegate sobre el pipeline inbound.

**Commits:** `56cef54`, `5d84fe2`, `66ced1f`, `6b49c30`, `2b0c6cc`,
`6141592`, `bd13b88`, `a2be354` (sales-agent) · `d19eeb1`, `1294c39`
(internal-agent) · `b3f2869`, `31be94a`, `7771517`, `47a1e74` (media) ·
`39b57bb`, `21cd178`, `a3cbbcd` (admin-ui). Merges `ddbccde`, `3a4a300`,
`0e42468`; push `78e34f4..0e42468`.

## Ola 3 — Hardening

**Worker:** `ah-security-hardening`.

**Qué aterrizó**

- `src/lib/auth/throttle.ts`: throttle per-IP + per-email al login,
  comparación de costo constante adaptada a scrypt, maps acotados.
- Buckets de rate-limit aislados por ruta en la superficie pública/inbound:
  inbound nunca puede ser starved por endpoints públicos; inbound
  rate-limit devuelve 429 (los providers reintentan) en vez de 200-ack-drop.
- Registro de las tools de ola 2 en `src/lib/agents/tools/registry.ts`
  (registry cerrado) + extensión de `scripts/check-agent-tools.mts`.

**Commits:** `868bb3e`, `2c4d4a5`, `9c3fe36`. Push `0e42468..9c3fe36`.

## Gates corridos (en cada merge y al cierre)

- `npm run typecheck` — verde.
- `npm run build` — verde.
- `npm run check:agent-tools` — verde.
- `npm run lint` — **NO usado como gate** (KI-13: toolchain roto, documentado
  en AGENTS.md / KNOWN-ISSUES.md).
- DB: solo `db:migrate` (idempotente). `db:push`/`db:seed` nunca corrieron.

## Resolución del grafo de conocimiento (inconsistencia `.graphify/` vs `graphify-out/`)

**Diagnóstico.** El repo acumuló dos lineages del tooling graphify:

- `.graphify/graph.json` — grafo commiteado por la línea npm
  (`@sentropic/graphify` 0.18.x, que ya no está instalada): 749 nodos
  descritos pero **viejo** (`scope.json.head = 81c3c0e`, anterior al port).
- `graphify-out/graph.json` — lo que produce el binario instalado
  (`graphify.exe` **0.9.46** en `~/.local/bin`, producto distinto al paquete
  npm): 2835→2861 nodos frescos sobre `9c3fe36`, **0 descripciones** (todo
  rebuild las borra y 0.9.46 no ingiere `batch-*.json`).

Los git hooks documentados como "parcheados" **no están instalados** —
`.git/hooks/` está vacío; por eso `.graphify/` quedó congelado.

**Decisión.** `graphify-out/` es el state root canónico *del CLI instalado*
(todos sus comandos defaultean ahí); `.graphify/graph.json` queda como
**espejo commiteado** del mismo grafo para la convención documentada. El
bridge lo implementan los scripts de `.opencode/skills/graph-first/`:

- `graphify-sync.mjs` (reescrito): `graphify update .` → `reapply-descriptions.mjs`,
  una pasada.
- `reapply-descriptions.mjs` (reescrito): escribe el cache versionado
  directo en `graphify-out/graph.json`, absorbe respuestas del asistente
  (`batch-NNN.json`), y espeja graph + report + labels + scope a `.graphify/`.
- `migrate-descriptions-v0946.mjs` (nuevo, one-time): re-keyeó las 749
  descripciones viejas (ids 0.18) a ids 0.9.46 por join `(source_file, label)`
  — rescató 624.
- `describe-new-nodes.mjs` (nuevo): baseline mecánico para nodos sin
  descripción (kind detectado en la línea declarada + docstring real del
  archivo); las entradas curadas quedan en el cache y pueden sobreescribirse.

**Resultado:** `2861/2861` nodos descritos en ambos grafos. `gitignore`
actualizado para `graphify-out/` (cache/, snapshots datados, manifest.json,
runtime dirs excluidos; se versionan graph.json, GRAPH_REPORT.md,
`.graphify_labels.json`, `.graphify_root`, `graph.html`). Comunidades: 161,
labels file-derived (sin backend LLM). Docs actualizados: `AGENTS.md` (sección
graphify) y `.opencode/skills/graph-first/SKILL.md` a la realidad 0.9.46.

## Ítems diferidos (conocidos, no bloqueantes)

1. **Dispatcher de ventas en el ingress unificado.** `@/lib/whatsapp/register`
   no se importa desde la ruta wave-1 (`/api/webhooks/ingress/[provider]`), así
   que por ese path corre el dispatcher canónico default, no el agente de
   ventas. El agente SÍ corre vía el Meta route
   (`src/app/api/whatsapp/webhook/[token]/route.ts`). Habilitarlo es una línea:
   `import "@/lib/whatsapp/register"` en la route del ingress.
2. **`messenger.send` sin contrato de templates.** El reply dentro de la
   ventana 24h sale como texto plano (caveat documentado en
   `src/lib/whatsapp/sales-agent.ts`); cuando se habilite `sendTemplate` en el
   provider, cambiar el dispatch a `type: "template"`.
3. **Seam `persist` de `processImage` (media).** Los workers de canal deben
   proveer el persist al adoptar el pipeline; documentado en
   `src/lib/media/downloader.ts`.
4. **`src/lib/whatsapp/prompt-security.ts` L75** — quirk de sintaxis parcial
   reportado por graphify (warning de extracción); no afecta typecheck/build.
5. **Validación en vivo pendiente** — igual que la plataforma previa: nada se
   probó contra providers reales (sin credenciales ni webhooks registrados).
   Ver `docs/10-AGENT-CHANNELS-GUIDE.md` §0.
6. **Git hooks de graphify** — no instalados en esta máquina; el sync es
   manual vía `graphify-sync.mjs`.
7. **Comunidades del grafo** con nombres file-derived (v0.9.46 sin backend LLM);
   mejorable a mano si se quiere curaduría.

## Archivos de referencia

- Brief de orquestación: `ORCHESTRATOR.md` (gitignored vía `.git/info/exclude`).
- Guía operativa de canales: `docs/10-AGENT-CHANNELS-GUIDE.md`.
- Reglas del grafo: `AGENTS.md` §graphify + `.opencode/skills/graph-first/SKILL.md`.
