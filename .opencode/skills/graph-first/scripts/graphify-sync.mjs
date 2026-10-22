#!/usr/bin/env node
/**
 * Full graphify sync: rebuild the graph, then re-apply descriptions.
 *
 * WHY THIS EXISTS
 * ---------------
 * The installed CLI (graphify 0.9.46) rebuilds `graphify-out/graph.json`
 * WITHOUT node descriptions and has no batch ingestion. Descriptions live in
 * the tracked cache at `.opencode/skills/graph-first/description-cache.json`
 * and are re-applied by `reapply-descriptions.mjs`, which writes them directly
 * into `graphify-out/graph.json` and then mirrors the canonical artifacts
 * (graph.json, GRAPH_REPORT.md, .graphify_labels.json, scope.json) into
 * `.graphify/`.
 *
 * Order matters: rebuild FIRST, apply SECOND — a single pass so an interrupted
 * run cannot leave a rebuilt-but-undescribed graph.
 *
 * USAGE
 * -----
 *   node .opencode/skills/graph-first/scripts/graphify-sync.mjs
 *
 * Idempotent; safe to run repeatedly. Never call `graphify hook-rebuild`
 * directly, and never a bare `graphify update .` unless you accept losing all
 * descriptions until the next reapply.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// Repo root: .opencode/skills/graph-first/scripts -> up four levels.
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
const REAPPLY = join(HERE, "reapply-descriptions.mjs");
const GRAPH = join(REPO_ROOT, "graphify-out", "graph.json");
const LEGACY_GRAPH = join(REPO_ROOT, ".graphify", "graph.json");
const CACHE = join(HERE, "..", "description-cache.json");

// Pin cwd so every relative path below is anchored to the repo.
process.chdir(REPO_ROOT);

function run(cmd, args, { useShell = process.platform === "win32" } = {}) {
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: useShell,
    cwd: REPO_ROOT,
  });
  return res.status === 0;
}

function countDescribed(path) {
  if (!existsSync(path)) return { described: 0, total: 0 };
  try {
    const g = JSON.parse(readFileSync(path, "utf-8"));
    const nodes = g.nodes ?? [];
    return {
      described: nodes.filter((n) => n.description && n.description.length > 0).length,
      total: nodes.length,
    };
  } catch {
    return { described: 0, total: 0 };
  }
}

console.log("[graphify-sync] step 1/2 — rebuild graph (graphify update .)");
run("graphify", ["update", "."]);

console.log("[graphify-sync] step 2/2 — apply cached descriptions + mirror to .graphify/");
if (existsSync(CACHE) && (existsSync(GRAPH) || existsSync(LEGACY_GRAPH))) {
  // shell:false — node.exe is a real executable and the repo path contains
  // spaces, which a shell would split.
  run(process.execPath, [REAPPLY], { useShell: false });
} else {
  console.log("[graphify-sync] no cache or no graph yet — skipping re-apply");
}

const { described, total } = countDescribed(existsSync(GRAPH) ? GRAPH : LEGACY_GRAPH);
console.log(`[graphify-sync] done — ${described}/${total} node(s) described`);

if (total > 0 && described < total) {
  console.log(
    `[graphify-sync] WARNING: ${total - described} node(s) have no cached description ` +
      "(new or renamed nodes). Run describe-new-nodes.mjs for a mechanical baseline " +
      "or fill .graphify/description-instructions/batch-*.json, then re-run this script.",
  );
}
