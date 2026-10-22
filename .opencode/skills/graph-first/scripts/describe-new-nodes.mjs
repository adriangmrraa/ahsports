#!/usr/bin/env node
/**
 * Generate baseline descriptions for graph nodes that have none.
 *
 * For every undescribed node in `graphify-out/graph.json` this writes a factual
 * one-sentence English description, derived from the actual source:
 *
 *   code symbol   -> "<Label> — <kind> exported from <file>: <doc line>" where
 *                    <kind> is detected from the declaration at source_location
 *                    and <doc line> is the first JSDoc/comment sentence above it.
 *   code file     -> "Source file <path>: <header comment>" or a path-based
 *                    module sentence.
 *   document      -> 'Section "<heading>" in <file>' or '"<title>" document'.
 *   concept/ref   -> "Reference '<label>' declared in <file>" (deps, tsconfig).
 *   rationale     -> "Comment in <file>: <excerpt>".
 *
 * Output is written as `.graphify/description-instructions/batch-NNN.json`
 * answer files — re-run `reapply-descriptions.mjs` (or graphify-sync.mjs) to
 * absorb them into the tracked cache and both graphs.
 *
 * Baseline, not gospel: hand-edit any cache entry afterwards for nodes that
 * deserve a richer sentence — the cache wins on later runs.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
process.chdir(REPO_ROOT);

const GRAPH = "graphify-out/graph.json";
const INSTR_DIR = ".graphify/description-instructions";
const BATCH_SIZE = 40;

if (!existsSync(GRAPH)) {
  console.error("[describe] no graphify-out/graph.json — run `graphify update .` first.");
  process.exit(1);
}

const graph = JSON.parse(readFileSync(GRAPH, "utf-8"));
// Undescribed nodes, plus thin/garbled baselines from a previous run that
// deserve a regeneration pass (file nodes without header doc, banner noise).
const misses = (graph.nodes ?? []).filter((n) => {
  if (!n.description) return true;
  if (/─{3,}|—{3,}/.test(n.description)) return true;
  if (!n.source_file) return false;
  const base = n.source_file.split("/").pop();
  const stem = base.replace(/\.[^.]+$/, "");
  const parentDir = n.source_file.split("/").slice(-2, -1)[0];
  const fileLevel = [base, stem, `${parentDir}/${base}`, `${parentDir}/${stem}`].includes(n.label);
  return fileLevel && !new RegExp(`^${n.source_file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} — [A-Z]`).test(n.description);
});
if (misses.length === 0) {
  console.log("[describe] nothing to do — all nodes already described.");
  process.exit(0);
}

const fileCache = new Map();
function linesOf(file) {
  if (!fileCache.has(file)) {
    try {
      fileCache.set(file, readFileSync(join(REPO_ROOT, file), "utf-8").split(/\r?\n/));
    } catch {
      fileCache.set(file, []);
    }
  }
  return fileCache.get(file);
}

function firstSentence(s) {
  const t = s.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.{20,160}?[.!?])\s/);
  return (m ? m[1] : t.slice(0, 160)).replace(/[*`]+/g, "").trim();
}

/** First JSDoc header block in the file's first 40 lines, as plain text. */
function headerDoc(lines) {
  let start = -1;
  for (let i = 0; i < Math.min(40, lines.length); i++) {
    if (lines[i].trim().startsWith("/**")) { start = i; break; }
    if (/^\s*export\s+(?!type\b)/.test(lines[i])) break;
  }
  if (start < 0) return "";
  const parts = [];
  for (let i = start; i < Math.min(start + 60, lines.length); i++) {
    const raw = lines[i];
    if (i > start && raw.includes("*/")) {
      parts.push(raw.replace(/\*\/.*$/, ""));
      break;
    }
    parts.push(raw);
    if (i === start && raw.includes("*/")) break;
  }
  const text = parts
    .join("\n")
    .replace(/^\s*\/\*\*\s?/m, "")
    .replace(/\*\/\s*$/, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter((l) => l && !/^[@\-\s─—=]*$/.test(l) && !/^─{3,}/.test(l))
    .join(" ");
  return firstSentence(text);
}

/** true when the line is a banner/section separator, not prose. */
const isBanner = (l) => /[─—═]{3,}/.test(l) || /^[\s\-*#_=~]{4,}$/.test(l.trim());

/** Contiguous comment block directly above line idx (0-based). */
function docAbove(lines, idx) {
  const parts = [];
  let i = idx - 1;
  // skip blank lines then decorators/annotations
  while (i >= 0 && (lines[i].trim() === "" || lines[i].trim().startsWith("@"))) i--;
  if (i < 0) return "";
  if (lines[i].trim().endsWith("*/")) {
    while (i >= 0 && !lines[i].includes("/**")) {
      parts.unshift(lines[i].replace(/^\s*\*\s?/, ""));
      i--;
    }
    if (i >= 0) parts.unshift(lines[i].replace(/^\s*\/\*\*\s?/, ""));
  } else if (lines[i].trim().startsWith("//")) {
    while (i >= 0 && lines[i].trim().startsWith("//")) {
      parts.unshift(lines[i].trim().replace(/^\/\/\s?/, ""));
      i--;
    }
  }
  const joined = parts.join(" ").replace(/\/?\*\//g, "");
  if (isBanner(joined) || !joined.trim()) return "";
  return firstSentence(joined);
}

function detectKind(lines, idx, label) {
  for (let i = idx; i < Math.min(idx + 4, lines.length); i++) {
    const l = lines[i];
    if (!l.includes(label) && i === idx) continue;
    const m = l.match(
      /\b(export\s+)?(default\s+)?(async\s+)?(interface|type|class|function|const|let|var|enum|def)\b/,
    );
    if (m) {
      const kw = m[4];
      if (kw === "interface") return "interface";
      if (kw === "type") return "type alias";
      if (kw === "class") return "class";
      if (kw === "enum") return "enum";
      if (kw === "def" || kw === "function") return "function";
      if (/=>|function/.test(l)) return "function";
      return "constant";
    }
  }
  return "symbol";
}

const DECL_FILE_RE = /\.(ts|tsx|js|jsx|mts|cts|py|sql|mjs|cjs)$/;

function describe(node) {
  const { label, source_file: file, source_location: loc, file_type: ft } = node;
  const lineNo = loc ? Number(String(loc).replace(/^L/, "")) : 1;
  const base = file ? basename(file) : "";

  if (ft === "document") {
    if (label === base) {
      const head = linesOf(file).find((l) => /^#\s+/.test(l.trim()));
      return head
        ? `Markdown document ${file}: "${firstSentence(head.replace(/^#\s+/, ""))}".`
        : `Markdown document ${file}.`;
    }
    return `Section "${label}" in ${file}.`;
  }

  if (ft === "concept" || ft === "rationale" || node.id.startsWith("ref_")) {
    if (file === "package.json") return `npm dependency "${label}" declared in package.json.`;
    if (file && file.endsWith("tsconfig.json"))
      return `TypeScript config reference "${label}" in ${file}.`;
    if (ft === "rationale")
      return `Design comment in ${file}: "${firstSentence(label)}".`;
    return `Reference "${label}" declared in ${file || "the corpus"}.`;
  }

  if (!file || !existsSync(join(REPO_ROOT, file))) {
    return `"${label}" — ${ft || "node"} extracted from the corpus without a file location.`;
  }

  const lines = linesOf(file);
  const stem = base.replace(/\.[^.]+$/, "");
  const parentDir = file.split("/").slice(-2, -1)[0];
  const prefixed = parentDir ? `${parentDir}/${base}` : null;
  const prefixedStem = parentDir ? `${parentDir}/${stem}` : null;
  if (label === base || label === stem || label === prefixed || label === prefixedStem) {
    const doc = headerDoc(lines);
    return doc
      ? `${file} — ${doc.replace(/\.$/, "")}.`
      : `Source file ${file} in ${file.split("/").slice(0, -1).join("/") || "the repo root"}.`;
  }

  const idx = Math.max(0, Math.min(lineNo - 1, lines.length - 1));
  const kind = detectKind(lines, idx, label);
  const doc = docAbove(lines, idx);
  const exported = /export/.test(lines[idx] || "") ? "exported from" : "declared in";
  return doc
    ? `${label} — ${kind} ${exported} ${file}: ${doc.replace(/\.$/, "")}.`
    : `${label} — ${kind} ${exported} ${file} (line ${lineNo}).`;
}

const answers = {};
for (const n of misses) answers[n.id] = describe(n);

mkdirSync(INSTR_DIR, { recursive: true });
const ids = Object.keys(answers);
let batches = 0;
for (let i = 0; i < ids.length; i += BATCH_SIZE) {
  const chunk = Object.fromEntries(ids.slice(i, i + BATCH_SIZE).map((k) => [k, answers[k]]));
  writeFileSync(
    join(INSTR_DIR, `batch-${String(batches).padStart(3, "0")}.json`),
    `${JSON.stringify(chunk, null, 2)}\n`,
    "utf-8",
  );
  batches++;
}
console.log(`[describe] ${ids.length} baseline description(s) -> ${batches} answer file(s).`);
console.log("[describe] re-run reapply-descriptions.mjs to absorb them into the cache + graphs.");
