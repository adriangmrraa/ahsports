---
name: graph-first
description: "Use when answering ANY question about this codebase (architecture, routes, data model, symbols, relationships, change impact) or when creating, updating, or refreshing the graphify knowledge graph at .graphify/. Enforces graph-first exploration over raw file reads and 1:1 graph/code parity."
---

# Graph First — consult, maintain, and rebuild the knowledge graph

This repo has a graphify knowledge graph at `.graphify/graph.json`. It is the
**entry point to the codebase**, not an optional aid.

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
grep the whole repo to "get oriented" — that is what `graphify summary` is for.

## 2. Command reference

| Need | Command |
|---|---|
| First-hop orientation: hubs, communities, density | `graphify summary` |
| "How does X work?" — broad BFS context | `graphify query "<question>"` |
| Trace a specific chain | `graphify query "<question>" --dfs` |
| Plain-language detail for one node | `graphify explain <node>` |
| Shortest path between two concepts | `graphify path "<A>" "<B>"` |
| Dependency tree from a node | `graphify tree <node>` |
| Blast radius of changed files | `graphify review-analysis --files <files>` |
| Focused review context | `graphify review-delta --files <files>` |
| CRG line-aware risk scoring | `graphify detect-changes --files <files>` |
| GraphRAG answer pack (you synthesize the answer) | `graphify answer "<question>"` |
| Execution flows derived from CALLS edges | `graphify flows` |
| Is the graph stale? | `graphify check-update` |
| Rebuild (one-shot, code + docs) | `graphify update .` |

`GRAPH_REPORT.md` is for **broad architecture review only**. Never read it by
default — it is large. `summary` + `query` replace it for almost everything.

### Query expansion (important)

`graphify query` matches node labels by case-folded substring + IDF. There is
**no stemming and no cross-language match**. If your question uses different
vocabulary than the graph labels, expand against the real graph vocabulary
first, then query with those tokens.

## 3. 1:1 parity with the code (mandatory)

The graph must always match the working tree.

**Git hooks are installed and patched** (`post-commit`, `post-checkout`,
`post-merge`, `post-rewrite`, plus a `.gitattributes` merge driver). They mark
`.graphify/needs_update` and sync the graph **in the background** after each
commit. They are advisory and never block git. Do not uninstall them.

> The stock hooks call `graphify hook-rebuild`, which **wipes every node
> description** (see §8). The installed hooks were patched to call
> `graphify-sync.mjs` instead. Re-running `graphify hook install` restores the
> stock hooks and undoes the patch — re-apply it afterwards.

### The canonical command

```powershell
node .opencode/skills/graph-first/scripts/graphify-sync.mjs
```

This is the **only** command you should use to refresh the graph. It:

1. regenerates the answer files from the tracked description cache, then
2. runs a single `graphify update .`, which rebuilds **and** re-ingests the
   descriptions in the same pass.

Never call `graphify hook-rebuild` directly. Never call a bare
`graphify update .` unless you accept losing all descriptions.

Protocol:

- **Stale marker present** → `.graphify/needs_update` exists. The graph is out
  of date. Run the sync script before trusting it, and tell the user it was
  stale.
- **Explicit check** → `graphify check-update` reports pending refresh signals.
- **End of a code session** → run the sync script so the graph ends in parity
  with the working tree. Do this before declaring work complete.
- **After a commit** → the patched hook syncs automatically; verify with
  `graphify state status` (shows the analyzed HEAD) and by checking the
  described-node count (see §5).

The graph is built from the **working tree, not from HEAD**. Uncommitted changes
are included. That is intentional.

Verify parity at any time:

```powershell
node -e "const g=require('./.graphify/graph.json');console.log(g.nodes.filter(n=>n.description).length+'/'+g.nodes.length+' described')"
```

## 4. Full rebuild

```powershell
graphify update .                 # code + docs, descriptions and labels on
graphify update . --no-description --no-label   # structural only, fastest
graphify update . --force         # overwrite even if the rebuild has fewer nodes
```

Scope resolution:

```powershell
graphify scope inspect            # what will be ingested
graphify update . --scope all     # include untracked files too
```

Default scope is `committed`. Untracked files are excluded — if you need an
untracked file in the graph, commit it or use `--scope all`.

## 5. Semantic enrichment (this is what makes the graph queryable)

Node descriptions and community names are **not optional**. Without them,
communities render as `Community N` and nodes have no natural-language
description, so `query` degrades to filename matching.

**No API keys are configured on this machine.** Graphify therefore runs in
`assistant` mode: instead of calling an LLM, it emits instruction files and
waits for the host assistant to fill them.

### The description cache (read this before re-describing anything)

Descriptions are persisted in a **git-tracked cache**:

```
.opencode/skills/graph-first/description-cache.json
```

A JSON object mapping `node_id` → one-sentence description. It currently holds
**528 descriptions**. Because it is tracked, the enrichment travels with the
repo instead of dying with the gitignored `.graphify/`.

`reapply-descriptions.mjs` reads this cache, writes the `batch-NNN.json` answer
files graphify expects, and absorbs any description it finds in `graph.json`
that is missing from the cache (self-healing). **Never re-describe a node by
hand if it is already in the cache.**

### Only when genuinely new nodes appear

The sync script reports uncached nodes:

```
[reapply] N uncached.
[reapply] nodes needing a fresh description from an assistant:
  - some_new_node_id
```

Only then does an assistant need to write descriptions. Procedure:

1. Run the sync script. It emits `.graphify/description-instructions/batch-NNN.md`
   for the nodes it could not resolve, and reports which ids are missing.
2. Write the sibling `batch-NNN.json`: a **single JSON object** mapping
   `node_id` → **one factual sentence in English**. No markdown fences, no
   prose. Omit a node only when the context is genuinely insufficient.
3. Run the sync script again — it absorbs the new descriptions into the tracked
   cache and ingests them.

### Community names

`.graphify/label-instructions/communities.md` lists communities with a
`[lang=…]` marker. Write `communities.json` mapping the community id (`"0"`…)
to a 2-5 word name.

- **Known defect:** graphify misdetects Spanish content as Portuguese and emits
  `[lang=pt]` for communities whose real source language is Spanish. Write those
  names in **Spanish**, not Portuguese. Do not normalize everything to one
  language.
- Community names are persisted separately in `.graphify/.graphify_labels.json`
  and therefore **survive rebuilds** — unlike descriptions.

### Verifying coverage

```
[graphify describe] coverage: 507/507 describable node(s) described
```

A handful of entity nodes carry no grounding and are intentionally left without
a description (anti-hallucination policy) — that is not a failure.

### Parallelizing new descriptions

New batches are independent and write to **disjoint output files**, so they can
be delegated to several workers at once. Give each worker the project glossary
(`pedido`=order, `insumo`=material, `receta`=BOM, `seña`=deposit, `caja`=cash
register, `prenda`=order item) so descriptions are accurate rather than generic.
Never let two workers touch the same file.

## 6. The graph IS versioned

`.graphify/graph.json`, `GRAPH_REPORT.md`, `.graphify_labels.json` and
`scope.json` are **committed**, so anyone who clones the repo gets a usable
graph without rebuilding it.

Only machine-bound artifacts are gitignored:

| Excluded | Why |
|---|---|
| `manifest.json` | stores absolute machine paths (`E:/Adrian OS/...`) |
| `branch.json`, `worktree.json` | local HEAD and worktree |
| `cache/`, `*-instructions/` | regenerable caches and prompts |
| `.graphify_describe_pending` | transient marker |
| `.opencode/**/.graphify/`, `.agents/**/.graphify/`, `.codex/**/.graphify/` | stray state graphify writes when it runs from a nested cwd |

**The committed graph is always ~1 commit behind by construction:** it contains
git commit nodes, so it cannot contain its own commit. After every commit the
hook rebuilds the graph and the working tree shows that difference as
"modified". That is correct — the working-tree graph is *ahead* of the
committed one, not behind.

**Git commit nodes self-describe** from the commit subject (see
`reapply-descriptions.mjs`), so they never need an assistant. Only genuinely
new code nodes do.

`graphify portable-check` is **not** a valid gate here: it reports ~237 issues,
most of them URL route paths (`/admin/pedidos`) misclassified as filesystem
absolute paths. The genuine problem is `manifest.json`, which is excluded.

## 7. Agent integration

| Agent | Mechanism |
|---|---|
| opencode | plugin `.opencode/plugins/graphify.js` (reminds before the first `bash`) + skill `.opencode/skills/graphify/SKILL.md` |
| Codex | hook `.codex/hooks.json` + skill `.agents/skills/graphify/SKILL.md`. Trigger is `$graphify`, **not** `/graphify` |
| Claude Code | global skill `~/.claude/skills/graphify/SKILL.md` |
| Anything else | use the `graphify` CLI directly |

To add another platform: `graphify <platform> install --project`.

## 8. Known graphify defects (verified empirically)

These were reproduced on graphify 0.18.0 and are the reason this skill ships
helper scripts. Do not "fix" them by reverting to stock commands.

1. **Every rebuild wipes all node descriptions.**
   `graphify update` and `graphify hook-rebuild` rebuild `graph.json` from
   scratch without descriptions. Descriptions only come back by ingesting answer
   files — and graphify **deletes both `batch-NNN.md` and `batch-NNN.json`** once
   it has ingested them. So the next rebuild has nothing to ingest.
   Community names survive (they are persisted in `.graphify/.graphify_labels.json`);
   descriptions do not.
   *Mitigation:* `graphify-sync.mjs` regenerates the answers from the tracked
   cache before each rebuild, so rebuild + ingest happen in one pass.

2. **`graphify hook-rebuild` is destructive.**
   It is what the stock `post-commit` hook calls, so a plain `git commit`
   silently degrades the graph from N described nodes to 0.
   *Mitigation:* the installed hooks are patched to call `graphify-sync.mjs`.

3. **Language misdetection.**
   Spanish content is reported as Portuguese (`[lang=pt]`) in community
   instruction files. Write those names in Spanish.

4. **`portable-check` false positives.**
   `graphify portable-check` reports 237 issues, most of them URL route paths
   (`/admin/pedidos`) misclassified as filesystem absolute paths. The genuine
   problem is `manifest.json` storing absolute machine paths. Either way:
   **do not commit `.graphify/`**.

## 9. Troubleshooting

- **`graphify` not found** → `npm install -g @sentropic/graphify`
- **Descriptions are 0 after a rebuild** → the cache did not get re-applied.
  Run `graphify-sync.mjs`. If it reports uncached nodes, those are genuinely new
  and need an assistant (see §5).
- **`explain` / `path` return nothing** → the node label differs from your
  term. Run `graphify summary`, then `graphify query` with graph vocabulary.
- **Duplicate labels** (`page.tsx`, `route.ts` appear many times) → expected.
  Next.js App Router produces many same-named files. Disambiguate with the
  `source_file` field, or query by symbol name instead.
- **Graph is empty after a build** → the corpus was fully skipped or is
  binary-only. Check `graphify scope inspect`.
- **The graph predates your uncommitted work** → the graph reflects the last
  build, not live edits. Run `graphify-sync.mjs`.
- **Hooks reverted to stock** → someone ran `graphify hook install`. Re-apply
  the patch: replace `$GRAPHIFY_CMD hook-rebuild || true` with
  `node .opencode/skills/graph-first/scripts/graphify-sync.mjs || true` in each
  hook under `.git/hooks/`.
