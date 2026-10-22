#!/usr/bin/env node
/**
 * One-time migration: carry v0.18-era node descriptions onto v0.9.46 node ids.
 *
 * WHY THIS EXISTS
 * ---------------
 * graphify 0.9.46 rebuilds into `graphify-out/graph.json` with a different
 * node-id scheme than the 0.18 line this repo was enriched under:
 *
 *   0.18:  <parentdir>_<filestem>[_<symbol>]      e.g. arte_page_arteglobalpage
 *   0.9.46: <full_sanitized_path>_<symbol>        e.g. src_app_..._arte_page_arteglobalpage
 *
 * The tracked description cache is keyed by 0.18 ids, so it cannot be applied
 * to the new graph by id. But both graphs carry `source_file` + `label`, which
 * are stable across versions. This script joins old graph → new graph on
 * (source_file, normalized label) and writes the result into the tracked cache
 * under the NEW node ids.
 *
 * RUN ONCE, before `.graphify/graph.json` is overwritten by the mirror step in
 * reapply-descriptions.mjs. Idempotent: existing new-id cache entries win.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(HERE, "..");
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");

const OLD_GRAPH = join(REPO_ROOT, ".graphify", "graph.json");
const NEW_GRAPH = join(REPO_ROOT, "graphify-out", "graph.json");
const CACHE = join(SKILL_DIR, "description-cache.json");

const norm = (s) =>
  (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

if (!existsSync(OLD_GRAPH)) {
  console.error("[migrate] no old graph at .graphify/graph.json — nothing to migrate.");
  process.exit(1);
}
if (!existsSync(NEW_GRAPH)) {
  console.error("[migrate] no new graph at graphify-out/graph.json — run `graphify update .` first.");
  process.exit(1);
}

const oldGraph = JSON.parse(readFileSync(OLD_GRAPH, "utf-8"));
const newGraph = JSON.parse(readFileSync(NEW_GRAPH, "utf-8"));
const cache = JSON.parse(readFileSync(CACHE, "utf-8"));

const oldByKey = new Map();
for (const o of oldGraph.nodes ?? []) {
  if (o.description && o.source_file) {
    oldByKey.set(`${o.source_file}|${norm(o.label)}`, o.description);
  }
}

let migrated = 0;
let already = 0;
const misses = [];
for (const n of newGraph.nodes ?? []) {
  if (cache[n.id]) {
    already += 1;
    continue;
  }
  const key = `${n.source_file || ""}|${norm(n.norm_label || n.label)}`;
  const desc = oldByKey.get(key);
  if (desc) {
    cache[n.id] = desc;
    migrated += 1;
  } else {
    misses.push(n.id);
  }
}

writeFileSync(CACHE, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");

console.log(
  `[migrate] ${migrated} description(s) carried to v0.9.46 ids; ` +
    `${already} already cached; ${misses.length} still uncached.`,
);
