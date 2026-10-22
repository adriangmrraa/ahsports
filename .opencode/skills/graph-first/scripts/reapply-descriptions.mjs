#!/usr/bin/env node
/**
 * Apply cached node descriptions to the graphify graph (v0.9.46 flow).
 *
 * WHY THIS EXISTS
 * ---------------
 * graphify rebuilds the graph WITHOUT node descriptions. The installed CLI
 * (v0.9.46) writes `graphify-out/graph.json` and — unlike the 0.18 line — has
 * no assistant-mode batch ingestion: `batch-*.json` files placed next to the
 * graph are never read. So this script applies the tracked description cache
 * DIRECTLY into `graph.json` node objects.
 *
 * Assistant workflow (unchanged in spirit):
 *   1. Run this script. It prints how many nodes are uncached and emits
 *      `.graphify/description-instructions/batch-NNN.md` prompt files listing
 *      each missing node id with its file/line context.
 *   2. Write sibling `batch-NNN.json` files: a single JSON object mapping
 *      `node_id` -> one factual English sentence. `describe-new-nodes.mjs`
 *      generates a mechanical baseline for all misses; hand-edit entries that
 *      deserve better.
 *   3. Re-run this script — it absorbs every `batch-NNN.json` into the tracked
 *      cache, applies them, and deletes the consumed answer files.
 *
 * After applying, it mirrors the canonical artifacts into `.graphify/` so the
 * documented path (`.graphify/graph.json`, `GRAPH_REPORT.md`,
 * `.graphify_labels.json`, `scope.json`) stays fresh for agents that read it
 * directly. `graphify-out/graph.json` is the build source of truth because the
 * CLI defaults every read to it; `.graphify/` is the committed mirror.
 *
 * USAGE
 * -----
 *   node .opencode/skills/graph-first/scripts/reapply-descriptions.mjs
 *
 * Normally run by `graphify-sync.mjs` after `graphify update .`.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  copyFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(HERE, "..");
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
process.chdir(REPO_ROOT);

const OUT_GRAPH = "graphify-out/graph.json";
const LEGACY_GRAPH = ".graphify/graph.json";
const INSTR_DIR = ".graphify/description-instructions";
const BATCH_SIZE = 40;

const PRIMARY_CACHE = join(SKILL_DIR, "description-cache.json");
const FALLBACK_CACHE = ".graphify/description-cache.json";

const cachePath = existsSync(PRIMARY_CACHE)
  ? PRIMARY_CACHE
  : existsSync(FALLBACK_CACHE)
    ? FALLBACK_CACHE
    : null;

if (!cachePath) {
  console.error("[reapply] no description cache found — nothing to re-apply.");
  process.exit(1);
}
const graphPath = existsSync(OUT_GRAPH)
  ? OUT_GRAPH
  : existsSync(LEGACY_GRAPH)
    ? LEGACY_GRAPH
    : null;
if (!graphPath) {
  console.error("[reapply] no graph.json found — run `graphify update .` first.");
  process.exit(1);
}

const cache = JSON.parse(readFileSync(cachePath, "utf-8"));
const graph = JSON.parse(readFileSync(graphPath, "utf-8"));
const nodes = graph.nodes ?? [];

mkdirSync(INSTR_DIR, { recursive: true });

// --- step 1: absorb assistant answer files (batch-NNN.json) into the cache ---
let absorbedAnswers = 0;
for (const f of readdirSync(INSTR_DIR)) {
  if (!/^batch-\d+\.json$/.test(f)) continue;
  try {
    const answers = JSON.parse(readFileSync(join(INSTR_DIR, f), "utf-8"));
    for (const [id, desc] of Object.entries(answers)) {
      if (typeof desc === "string" && desc.trim()) {
        cache[id] = desc.trim();
        absorbedAnswers += 1;
      }
    }
    unlinkSync(join(INSTR_DIR, f));
  } catch (e) {
    console.error(`[reapply] could not parse ${f}: ${e.message} — left in place.`);
  }
}

// --- step 2: apply cache to graph nodes; absorb strays; collect misses ---
let applied = 0;
let learned = 0;
const misses = [];
for (const node of nodes) {
  if (cache[node.id]) {
    node.description = cache[node.id];
    applied += 1;
  } else if (node.description) {
    cache[node.id] = node.description;
    learned += 1;
    applied += 1;
  } else {
    misses.push(node);
  }
}

writeFileSync(graphPath, `${JSON.stringify(graph)}\n`, "utf-8");

// --- step 3: emit prompt files for nodes still needing a description ---
for (const f of readdirSync(INSTR_DIR)) {
  if (/^batch-\d+\.md$/.test(f)) unlinkSync(join(INSTR_DIR, f));
}
for (let i = 0; i < misses.length; i += BATCH_SIZE) {
  const chunk = misses.slice(i, i + BATCH_SIZE);
  const lines = chunk.map(
    (n) =>
      `- ${n.id}  (${n.file_type || "?"}: ${n.source_file || "no-file"} ${n.source_location || ""}) label="${n.label}"`,
  );
  writeFileSync(
    join(INSTR_DIR, `batch-${String(i / BATCH_SIZE).padStart(3, "0")}.md`),
    `# Describe these graph nodes — one factual English sentence each.\n` +
      `Write sibling file batch-${String(i / BATCH_SIZE).padStart(3, "0")}.json mapping node_id -> description.\n\n` +
      lines.join("\n") +
      "\n",
    "utf-8",
  );
}

// --- step 4: mirror canonical artifacts into .graphify/ ---
mkdirSync(".graphify", { recursive: true });
if (graphPath === OUT_GRAPH) {
  copyFileSync(OUT_GRAPH, LEGACY_GRAPH);
  for (const f of ["GRAPH_REPORT.md", ".graphify_labels.json"]) {
    const src = join("graphify-out", f);
    if (existsSync(src)) copyFileSync(src, join(".graphify", f));
  }
  const scope = {
    requested_mode: "auto",
    resolved_mode: "committed",
    source: "default-auto",
    root: ".",
    git_root: ".",
    head: graph.built_at_commit ?? null,
    node_count: nodes.length,
    generated_by: "graphify 0.9.46 -> graphify-out/, mirrored to .graphify/ by reapply-descriptions.mjs",
  };
  writeFileSync(".graphify/scope.json", `${JSON.stringify(scope, null, 2)}\n`, "utf-8");
}

if (absorbedAnswers > 0 || learned > 0 || applied > 0) {
  writeFileSync(PRIMARY_CACHE, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");
}

console.log(
  `[reapply] ${applied}/${nodes.length} described (${absorbedAnswers} from answers, ` +
    `${learned} absorbed from graph); ${misses.length} uncached -> ` +
    `${Math.ceil(misses.length / BATCH_SIZE)} prompt file(s) in ${INSTR_DIR}`,
);
if (graphPath === OUT_GRAPH) {
  console.log("[reapply] mirrored graph.json + report + labels + scope into .graphify/");
}
