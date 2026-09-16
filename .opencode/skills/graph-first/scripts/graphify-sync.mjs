#!/usr/bin/env node
/**
 * Full graphify sync: re-apply descriptions, then rebuild + ingest in one pass.
 *
 * WHY THIS EXISTS
 * ---------------
 * In assistant mode, graphify rebuilds `.graphify/graph.json` WITHOUT node
 * descriptions. Descriptions are only restored by ingesting answer files, and
 * graphify DELETES both the `batch-NNN.md` prompts and the `batch-NNN.json`
 * answers once ingested.
 *
 * Net effect: every `graphify update` / `graphify hook-rebuild` wipes all
 * descriptions. Community names survive (they live in
 * `.graphify/.graphify_labels.json`); node descriptions do not.
 *
 * Because the `post-commit` hook originally called `graphify hook-rebuild`, a
 * plain `git commit` silently degraded the graph from N described nodes to 0.
 *
 * This script writes the answer files from a persistent cache FIRST, then runs
 * a single `graphify update`, which rebuilds and ingests in the same pass. That
 * ordering matters: it is one pass, so an interrupted run cannot leave the
 * graph rebuilt-but-undescribed.
 *
 * USAGE
 * -----
 *   node .opencode/skills/graph-first/scripts/graphify-sync.mjs
 *
 * Called automatically by the patched `.git/hooks/post-commit|post-checkout|
 * post-merge|post-rewrite`. Idempotent; safe to run repeatedly.
 *
 * NOTE: `graphify hook install` restores the stock hooks and will undo the
 * patch. Re-apply it after re-installing.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// Repo root: .opencode/skills/graph-first/scripts -> up four levels.
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
const REAPPLY = join(HERE, "reapply-descriptions.mjs");
const GRAPH = join(REPO_ROOT, ".graphify", "graph.json");
// Tracked in git, so the enrichment travels with the repo.
const CACHE = join(HERE, "..", "description-cache.json");

// Git hooks run with an environment where graphify mis-resolves its state root
// and writes a stray .opencode/.graphify/ cache. Pinning the cwd fixes it.
process.chdir(REPO_ROOT);

function run(cmd, args, { useShell = process.platform === "win32" } = {}) {
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: useShell,
    cwd: REPO_ROOT,
  });
  return res.status === 0;
}

function countDescribed() {
  if (!existsSync(GRAPH)) return { described: 0, total: 0 };
  try {
    const g = JSON.parse(readFileSync(GRAPH, "utf-8"));
    const nodes = g.nodes ?? [];
    return {
      described: nodes.filter((n) => n.description && n.description.length > 0).length,
      total: nodes.length,
    };
  } catch {
    return { described: 0, total: 0 };
  }
}

console.log("[graphify-sync] step 1/2 — re-apply cached descriptions");
if (existsSync(CACHE) && existsSync(GRAPH)) {
  // shell:false — node.exe is a real executable and this path contains spaces
  // ("Adrian OS"), which a shell would split.
  run(process.execPath, [REAPPLY], { useShell: false });
} else {
  console.log("[graphify-sync] no cache or no graph yet — skipping re-apply");
}

console.log("[graphify-sync] step 2/2 — rebuild + ingest");
run("graphify", ["update", "."]);

const { described, total } = countDescribed();
console.log(`[graphify-sync] done — ${described}/${total} node(s) described`);

if (total > 0 && described < total) {
  console.log(
    `[graphify-sync] WARNING: ${total - described} node(s) have no cached description ` +
      "(new or renamed nodes). An assistant must fill the remaining batch-*.json files in " +
      ".graphify/description-instructions/ and re-run `graphify update .`.",
  );
}
