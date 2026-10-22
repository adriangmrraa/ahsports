---
name: graph-first
description: "Use when answering ANY question about this codebase (architecture, routes, data model, symbols, relationships, change impact) or when creating, updating, or refreshing the graphify knowledge graph at .graphify/. Enforces graph-first exploration over raw file reads and 1:1 graph/code parity."
---

# Graph First — consult, maintain, and rebuild the knowledge graph

This repo has a graphify knowledge graph. **Installed CLI: graphify 0.9.46**
(the `graphify.exe` binary in `~/.local/bin`, NOT npm `@sentropic/graphify`).
Its state root is **`graphify-out/`** — every command defaults to
`graphify-out/graph.json`. `.graphify/graph.json` is a committed **mirror** of
the same graph, kept in sync by `scripts/reapply-descriptions.mjs`.

It is the **entry point to the codebase**, not an optional aid.

## 1. Hard rule: graph first, code second

For ANY question about code, architecture, routes, the data model, symbols,
relationships, or the blast radius of a change:

1. **Query the graph first.**
2. Read raw files (`read` / `grep` / `glob`) **only** when the graph is not
   enough:
   - you need to edit an exact line,
   - you need to verify an implementation detail the graph does not carry,
   - `query` / `explain` / `path` returned too little context.
3. When you assert something about the code, cite the `source_location` the
   graph returned.
4. If the graph lacks the fact, **say so**. Never invent edges or behavior.

Reading raw files before consulting the graph is a contract violation. Do not
grep the whole repo to "get oriented" — that is what `graphify god-nodes` is for.

## 2. Command reference

| Need | Command (v0.9.46) |
|---|---|
| First-hop orientation: architectural hubs | `graphify god-nodes` |
| "How does X work?" — broad BFS context | `graphify query "<question>"` |
| Trace a specific chain | `graphify query "<question>" --dfs` |
| Plain-language detail for one node | `graphify explain "<node>"` |
| Shortest path between two concepts | `graphify path "<A>" "<B>"` |
| Reverse impact traversal from a node | `graphify affected "<node>"` |
| D3 collapsible-tree HTML of the graph | `graphify tree` |
| Visual studio export | `graphify-out/graph.html` (already generated) |

`graphify-out/GRAPH_REPORT.md` is for **broad architecture review only**. Never
read it by default — it is large. `god-nodes` + `query` replace it for almost
everything.

Commands that existed in the 0.18 lineage but **do NOT exist in 0.9.46**:
`summary`, `tree <node>` (0.9.46's `tree` is an HTML export, not a dep tree),
`review-analysis`, `review-delta`, `detect-changes`, `answer`, `flows`,
`state status`, `scope inspect`, `portable-check`, `hook-rebuild`,
`migrate-state`, `wiki describe`. Do not run them — the binary errors.

### Query expansion (important)

`graphify query` matches node labels by case-folded substring + IDF. There is
**no stemming and no cross-language match**. If your question uses different
vocabulary than the graph labels, expand against the real graph vocabulary
first, then query with those tokens.

## 3. 1:1 parity with the code (mandatory)

The graph must always match the working tree.

**Git hooks are NOT currently installed.** Sync is manual — run the canonical
command at the end of a code session. Do NOT run `graphify hook install`: the
stock hooks call `hook-rebuild`-equivalent rebuilds that do not re-apply
descriptions.

### The canonical command

```powershell
node .opencode/skills/graph-first/scripts/graphify-sync.mjs
```

This is the **only** command you should use to refresh the graph. It:

1. runs `graphify update .`, which rebuilds `graphify-out/graph.json` WITHOUT
   descriptions, then
2. runs `reapply-descriptions.mjs`, which writes the tracked description cache
   DIRECTLY into `graphify-out/graph.json` (0.9.46 has no answer-file
   ingestion — the script edits the JSON itself) and mirrors
   `graph.json` + `GRAPH_REPORT.md` + `.graphify_labels.json` + `scope.json`
   into `.graphify/`.

One pass: rebuild then apply. An interrupted run can only leave the graph
unrebuilt or unapplied — never rebuilt-but-committed-undescribed.

Never call a bare `graphify update .` unless you accept losing all
descriptions until the next reapply. There is no `hook-rebuild` in 0.9.46.

Protocol:

- **End of a code session** → run the sync script so the graph ends in parity
  with the working tree. Do this before declaring work complete.
- **Freshness signal** → `graphify-out/graph.json` carries `built_at_commit`
  with the analyzed HEAD; compare against `git rev-parse HEAD`.
- **Staleness** → if `built_at_commit` lags HEAD and the diff touched source
  files, run the sync before trusting the graph, and say it was stale.

The graph is built from the **working tree, not from HEAD**. Uncommitted changes
are included. That is intentional.

Verify parity at any time:

```powershell
node -e "const g=require('./graphify-out/graph.json');console.log(g.nodes.filter(n=>n.description).length+'/'+g.nodes.length+' described')"
# .graphify/graph.json mirrors the same content
```

## 4. Full rebuild

```powershell
graphify update .                 # code + docs; writes graphify-out/graph.json
graphify update . --force         # overwrite even if the rebuild has fewer nodes
graphify update . --no-cluster    # structural only (raw extraction), fastest
```

v0.9.46 has no `scope inspect` and no `--scope` flag on `update` — the corpus
is the git-committed working tree. After any bare `update`, run
`reapply-descriptions.mjs` (or `graphify-sync.mjs`, which does both).

## 5. Semantic enrichment (this is what makes the graph queryable)

Node descriptions are **not optional**: without them `query` degrades to
filename matching.

**No API keys are configured on this machine.** v0.9.46 has no assistant-mode
batch ingestion and its LLM commands (`label`, `extract --backend`) need keys —
so descriptions come from the tracked cache + helper scripts, applied directly
into the JSON by `reapply-descriptions.mjs`.

### The description cache (read this before re-describing anything)

Descriptions are persisted in a **git-tracked cache**:

```
.opencode/skills/graph-first/description-cache.json
```

A JSON object mapping `node_id` → one-sentence description. Because it is
tracked, the enrichment travels with the repo.

`reapply-descriptions.mjs` reads this cache and writes `description` straight
into `graphify-out/graph.json` nodes, absorbs any in-graph description missing
from the cache (self-healing), mirrors to `.graphify/`, and reports uncached
nodes. **Never re-describe a node by hand if it is already in the cache.**

### Only when genuinely new nodes appear

The reapply reports uncached nodes and emits
`.graphify/description-instructions/batch-NNN.md` prompt files (id + file +
line per node). Then:

1. Run `scripts/describe-new-nodes.mjs` — generates a mechanical baseline
   `batch-NNN.json` per batch (declaration kind + docstring extracted from the
   real source; document sections get 'Section "X" in file'). Honest and
   factual; hand-edit cache entries afterwards for nodes that deserve better.
2. OR write the sibling `batch-NNN.json` yourself: a **single JSON object**
   mapping `node_id` → **one factual sentence in English**.
3. Re-run `reapply-descriptions.mjs` (or `graphify-sync.mjs`) — it absorbs the
   answer files into the tracked cache, applies them, deletes the consumed
   files.

### Community names

v0.9.46 names communities via LLM backends (`graphify label`); with no keys it
falls back to file-derived names persisted in `graphify-out/.graphify_labels.json`
(mirrored to `.graphify/`). To curate them by hand, edit that JSON and the
per-node `community_name` fields — but prefer spending effort on node
descriptions.

### Verifying coverage

```
node -e "const g=require('./graphify-out/graph.json');console.log(g.nodes.filter(n=>n.description).length+'/'+g.nodes.length)"
```

### Parallelizing new descriptions

New batches are independent and write to **disjoint output files**, so they can
be delegated to several workers at once. Give each worker the project glossary
(`pedido`=order, `insumo`=material, `receta`=BOM, `seña`=deposit, `caja`=cash
register, `prenda`=order item) so descriptions are accurate rather than generic.
Never let two workers touch the same file.

## 6. The graph IS versioned

Committed so anyone who clones gets a usable graph without rebuilding:

- `graphify-out/`: `graph.json`, `GRAPH_REPORT.md`, `.graphify_labels.json`
  (+`.sig`), `.graphify_root`, `graph.html`
- `.graphify/` (mirror): `graph.json`, `GRAPH_REPORT.md`,
  `.graphify_labels.json`, `scope.json`

Only machine-bound/regenerable artifacts are gitignored:

| Excluded | Why |
|---|---|
| `graphify-out/cache/` | AST + stat-index caches, rebuilt automatically |
| `graphify-out/manifest.json` | per-file mtimes of this machine |
| `graphify-out/20XX-*/` | per-run dated snapshots the CLI keeps |
| `graphify-out/needs_update`, `memory/`, `reflections/` | runtime state |
| `.graphify/description-instructions/` | assistant prompt/answer batches |
| `.opencode/**/.graphify/`, `.agents/**/.graphify/`, `.codex/**/.graphify/` | stray state graphify writes when it runs from a nested cwd |

v0.9.46 emits **no git-commit nodes**, so the graph does not lag by
construction — `built_at_commit` reflects the HEAD that was analyzed.

## 7. Agent integration

| Agent | Mechanism |
|---|---|
| opencode | plugin `.opencode/plugins/graphify.js` (reminds before the first `bash`) + skill `.opencode/skills/graphify/SKILL.md` |
| Codex | hook `.codex/hooks.json` + skill `.agents/skills/graphify/SKILL.md`. Trigger is `$graphify`, **not** `/graphify` |
| Claude Code | global skill `~/.claude/skills/graphify/SKILL.md` |
| Anything else | use the `graphify` CLI directly |

To add another platform: `graphify <platform> install --project`.

## 8. Known graphify defects and version split (verified empirically)

1. **Every rebuild wipes all node descriptions.**
   `graphify update` rebuilds `graphify-out/graph.json` without descriptions,
   and 0.9.46 has no answer-file ingestion — they only come back by
   re-applying the tracked cache (`reapply-descriptions.mjs` edits the JSON
   directly). *Mitigation:* `graphify-sync.mjs` runs update + reapply in one
   pass.

2. **Two graphify lineages live in this repo's tooling docs.**
   The npm lineage (`@sentropic/graphify` 0.18+) uses `.graphify/` and ships
   `summary`/`review-analysis`/`hook-rebuild`/`migrate-state`. The installed
   binary (`graphify.exe` 0.9.46, `~/.local/bin`) uses `graphify-out/` and a
   different command surface. Scripts and docs were adapted to the INSTALLED
   binary; if a newer npm version is installed later, re-check `--help` before
   assuming behavior.

3. **Node ids differ across lineages.**
   0.18 ids are `<parentdir>_<filestem>_<symbol>`; 0.9.46 ids are
   `<full_sanitized_path>_<symbol>`. The cache was re-keyed to 0.9.46 ids via
   `scripts/migrate-descriptions-v0946.mjs` (join on `source_file`+label).
   Keep that script for history; it only needs to run again if an 0.18 graph
   resurfaces.

4. **`manifest.json` is machine-bound.**
   v0.9.46 stores relative paths + mtimes. It is gitignored — do not commit it.

## 9. Troubleshooting

- **`graphify` not found** → the binary lives at `~/.local/bin/graphify.exe`;
  the npm package is `npm install -g @sentropic/graphify` (different lineage —
  verify which one is on PATH before relying on a command surface).
- **Descriptions are 0 after a rebuild** → the cache did not get re-applied.
  Run `reapply-descriptions.mjs`. If it reports uncached nodes, run
  `describe-new-nodes.mjs` then reapply again (see §5).
- **`explain` / `path` return nothing** → the node label differs from your
  term. Run `graphify god-nodes`, then `graphify query` with graph vocabulary.
- **Duplicate labels** (`page.tsx`, `route.ts` appear many times) → expected.
  Next.js App Router produces many same-named files. Disambiguate with the
  `source_file` field, or query by symbol name instead.
- **The graph predates your uncommitted work** → the graph reflects the last
  build, not live edits. Run `graphify-sync.mjs`.
- **`graphify-out/` looks dirty after sync** → `graph.json`, `GRAPH_REPORT.md`,
  `graph.html`, labels and `manifest.json` churn on every rebuild; the ignored
  artifacts (cache/, snapshots) never appear in `git status`.
