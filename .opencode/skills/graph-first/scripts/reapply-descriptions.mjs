#!/usr/bin/env node
/**
 * Re-apply cached node descriptions so `graphify update` can ingest them.
 *
 * WHY THIS EXISTS
 * ---------------
 * In assistant mode, graphify rebuilds `.graphify/graph.json` WITHOUT node
 * descriptions. Descriptions are only restored by *ingesting answer files*, and
 * graphify DELETES both the `batch-NNN.md` prompts and the `batch-NNN.json`
 * answers once it has ingested them.
 *
 * Net effect: every `graphify update` / `graphify hook-rebuild` wipes all
 * descriptions. Community names survive (persisted in
 * `.graphify/.graphify_labels.json`); node descriptions do not.
 *
 * This script regenerates the answer files from a persistent cache keyed by
 * node id, so descriptions survive rebuilds without an assistant rewriting
 * hundreds of sentences.
 *
 * The cache is TRACKED IN GIT at
 * `.opencode/skills/graph-first/description-cache.json` so the enrichment
 * travels with the repo instead of dying with the gitignored `.graphify/`.
 *
 * USAGE
 * -----
 *   node .opencode/skills/graph-first/scripts/reapply-descriptions.mjs
 *   graphify update .
 *
 * Normally you do not run this by hand — `graphify-sync.mjs` wraps both steps.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(HERE, "..");
// Repo root: .opencode/skills/graph-first/scripts -> up four levels.
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");

// Git hooks run with an environment where graphify mis-resolves its state root.
// Pinning the cwd keeps every relative path below anchored to the repo.
process.chdir(REPO_ROOT);

const GRAPH = ".graphify/graph.json";
const DIR = ".graphify/description-instructions";
const BATCH_SIZE = 40;

// Primary cache is tracked in git and ships with the repo; the .graphify copy is
// a local fallback for graphs built before the cache was moved.
const PRIMARY_CACHE = join(SKILL_DIR, "description-cache.json");
const FALLBACK_CACHE = ".graphify/description-cache.json";

const cachePath = existsSync(PRIMARY_CACHE)
  ? PRIMARY_CACHE
  : existsSync(FALLBACK_CACHE)
    ? FALLBACK_CACHE
    : null;

if (!cachePath) {
  console.error("[reapply] no description cache found — nothing to re-apply.");
  console.error(`[reapply] expected at ${PRIMARY_CACHE}`);
  process.exit(1);
}
if (!existsSync(GRAPH)) {
  console.error(`[reapply] no graph at ${GRAPH} — run \`graphify update .\` first.`);
  process.exit(1);
}

const cache = JSON.parse(readFileSync(cachePath, "utf-8"));
const graph = JSON.parse(readFileSync(GRAPH, "utf-8"));
const nodes = graph.nodes ?? [];

mkdirSync(DIR, { recursive: true });

// Clear stale answer files so graphify never ingests ids that no longer exist.
for (const f of readdirSync(DIR)) {
  if (/^batch-\d+\.json$/.test(f)) unlinkSync(join(DIR, f));
}

const hits = [];
const misses = [];
let learned = 0;

for (const node of nodes) {
  if (cache[node.id]) {
    hits.push([node.id, cache[node.id]]);
  } else if (node.description) {
    // Description present in the graph but absent from the cache — absorb it.
    cache[node.id] = node.description;
    hits.push([node.id, node.description]);
    learned += 1;
  } else {
    misses.push(node.id);
  }
}

let batch = 0;
for (let i = 0; i < hits.length; i += BATCH_SIZE) {
  const chunk = Object.fromEntries(hits.slice(i, i + BATCH_SIZE));
  writeFileSync(
    join(DIR, `batch-${String(batch).padStart(3, "0")}.json`),
    `${JSON.stringify(chunk, null, 2)}\n`,
    "utf-8",
  );
  batch += 1;
}

// Persist anything newly absorbed so the tracked cache keeps improving.
if (learned > 0) {
  writeFileSync(PRIMARY_CACHE, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");
}

console.log(
  `[reapply] ${hits.length} description(s) → ${batch} batch file(s); ` +
    `${misses.length} uncached${learned > 0 ? `; ${learned} absorbed into the cache` : ""}.`,
);
if (misses.length > 0) {
  console.log("[reapply] nodes needing a fresh description from an assistant:");
  for (const id of misses.slice(0, 40)) console.log(`  - ${id}`);
  if (misses.length > 40) console.log(`  ... and ${misses.length - 40} more`);
}
console.log("[reapply] now run: graphify update .");
