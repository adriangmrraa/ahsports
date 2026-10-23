/**
 * Minimal in-memory Drizzle stand-in for the agent-layer behavior tests.
 *
 * Supports only the query shapes this codebase uses:
 *   select → from → where → orderBy → limit
 *   insert → values → onConflictDoNothing | onConflictDoUpdate → returning
 *   update → set → where
 *   delete → where → returning
 * plus the eq/and/or/gt/like/ilike/in-array/is-null/coalesce predicates and
 * the `IS NOT DISTINCT FROM` jsonb CAS used by session metadata.
 *
 * Unique keys mirror the partial indexes from migration 0011:
 *   conversations  (channel, channel_account_id, external_thread_id) | legacy
 *   chat_messages  (channel, channel_account_id, platform_message_id) | legacy
 */
import { randomUUID } from "node:crypto";

import { getTableName } from "drizzle-orm";

type Row = Record<string, unknown>;

interface SqlNode {
  queryChunks?: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isSqlNode(value: unknown): value is SqlNode {
  return isRecord(value) && Array.isArray(value.queryChunks);
}

function isColumn(value: unknown): value is { name: string } {
  return isRecord(value) && typeof value.name === "string" && "table" in value;
}

/**
 * Collect bound values from a SQL node.
 *
 * Drizzle encodes bound values in three different ways:
 * - `Param { value, encoder }` (booleans, numbers, explicit params),
 * - boxed `new String(...)` for plain string values (`ilike(col, "x")`),
 * - raw interpolations may arrive as either of the above.
 * StringChunk (`value: string[]`), Columns (have `table`) and SQL nodes
 * (`queryChunks`) are not params and are skipped (SQL nodes are recursed).
 */
function collectParams(node: SqlNode, out: unknown[] = []): unknown[] {
  for (const chunk of node.queryChunks ?? []) {
    // Drizzle stores bound string values as primitive chunks; SQL fragments
    // are always StringChunk instances, so a primitive here is always a param.
    if (typeof chunk === "string") {
      out.push(chunk);
      continue;
    }
    if (isRecord(chunk)) {
      if ("encoder" in chunk) {
        out.push(chunk.value);
        continue;
      }
      if (
        "value" in chunk &&
        !Array.isArray(chunk.value) &&
        !("queryChunks" in chunk) &&
        !("table" in chunk)
      ) {
        out.push(chunk.value);
        continue;
      }
    }
    if (isSqlNode(chunk)) collectParams(chunk, out);
  }
  return out;
}

function textOf(node: SqlNode): string {
  let text = "";
  for (const chunk of node.queryChunks ?? []) {
    if (isRecord(chunk) && Array.isArray(chunk.value)) {
      text += chunk.value.join("");
    }
  }
  return text;
}

function collect<T>(node: SqlNode, match: (value: unknown) => value is T, out: T[] = []): T[] {
  for (const chunk of node.queryChunks ?? []) {
    if (match(chunk)) out.push(chunk);
    if (isSqlNode(chunk)) collect(chunk, match, out);
  }
  return out;
}

function firstColumn(node: SqlNode): { name: string } | undefined {
  return collect(node, isColumn)[0];
}

function paramsOf(node: SqlNode): unknown[] {
  return collectParams(node);
}

function listValuesOf(node: SqlNode): unknown[] {
  return collect(node, Array.isArray as (value: unknown) => value is unknown[])
    .flat()
    .map((value) =>
      isRecord(value) && "encoder" in value && "value" in value
        ? value.value
        : value
    );
}

/** Drizzle column names are snake_case; rows stay camelCase like the schema. */
function camelName(column: { name: string }): string {
  return column.name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function valueOf(row: Row, column: { name: string }): unknown {
  if (column.name in row) return row[column.name];
  return row[camelName(column)];
}

function evaluate(expr: unknown, row: Row): boolean {
  if (!isSqlNode(expr)) return true;
  const text = textOf(expr).toLowerCase();
  const nested = (expr.queryChunks ?? []).filter(isSqlNode);

  if (/\s+and\s+/.test(text)) return nested.every((child) => evaluate(child, row));
  if (/\s+or\s+/.test(text)) return nested.some((child) => evaluate(child, row));

  const column = firstColumn(expr);
  const columns = collect(expr, isColumn);
  const params = paramsOf(expr);

  if (/\bis not distinct from\b/.test(text)) {
    if (!column) return true;
    // The only caller interpolates JSON.stringify(state) as the right side.
    return JSON.stringify(valueOf(row, column)) === String(params[0]);
  }
  if (/\bcoalesce\s*\(/i.test(text)) {
    if (!column) return true;
    const left = valueOf(row, column) ?? null;
    return left === (params.length > 0 ? params[0] ?? null : null);
  }
  if (/\bis\s+not\s+null\b/.test(text)) {
    return column ? valueOf(row, column) != null : true;
  }
  if (/\bis\s+null\b/.test(text)) {
    return column ? valueOf(row, column) == null : true;
  }
  if (/\bnot\s+(?:i)?like\b/.test(text)) {
    if (!column) return true;
    const value = String(valueOf(row, column) ?? "").toLowerCase();
    const pattern = String(params[0] ?? "").toLowerCase().replace(/%/g, ".*");
    return !new RegExp(`^${pattern}$`).test(value);
  }
  if (/\bilike\b/.test(text) || /\blike\b/.test(text)) {
    if (!column) return true;
    const value = String(valueOf(row, column) ?? "").toLowerCase();
    const pattern = String(params[0] ?? "").toLowerCase().replace(/%/g, ".*");
    return new RegExp(`^${pattern}$`).test(value);
  }
  if (/\bin\b/.test(text)) {
    if (!column) return true;
    const values = [...params, ...listValuesOf(expr)];
    return values.some((value) => valueOf(row, column) === value);
  }
  if (text.includes(">")) {
    if (!column) return true;
    const left = valueOf(row, column);
    const right = params[0];
    if (left == null || right == null) return false;
    return (left as number | Date) > (right as number | Date);
  }
  if (text.includes("=")) {
    if (!column) return true;
    if (params.length > 0) return valueOf(row, column) === params[0];
    if (columns.length > 1) return valueOf(row, columns[0]) === valueOf(row, columns[1]);
    return true;
  }
  if (nested.length === 1) return evaluate(nested[0], row);
  return true;
}

function resolveSetValue(row: Row, key: string, value: unknown): unknown {
  if (!isSqlNode(value)) return value;
  const text = textOf(value).toLowerCase();
  const params = paramsOf(value);
  if (/\bcoalesce\s*\(/i.test(text)) {
    const existing = row[key];
    return existing ?? (params.length > 0 ? params[0] ?? null : null);
  }
  if (/\+\s*1\b/.test(text)) {
    return Number(row[key] ?? 0) + 1;
  }
  return row[key];
}

function uniqueKeys(table: string, row: Row): string[] {
  const keys: string[] = [];
  if (table === "conversations") {
    if (row.channelAccountId != null) {
      keys.push(
        `conv:acc:${String(row.channel)}|${String(row.channelAccountId)}|${String(
          row.externalThreadId
        )}`
      );
    } else {
      keys.push(`conv:legacy:${String(row.channel)}|${String(row.externalThreadId)}`);
    }
  }
  if (table === "chat_messages") {
    keys.push(
      `msg:${String(row.channel)}|${String(row.channelAccountId ?? "")}|${String(
        row.platformMessageId
      )}`
    );
  }
  if (table === "idempotency_keys") keys.push(`pk:${String(row.key)}`);
  if (table === "agent_memories") keys.push(`mem:${String(row.scope)}|${String(row.key)}`);
  if (table === "lead_identities") {
    keys.push(`lead:${String(row.channel)}|${String(row.externalId)}`);
  }
  if (table === "agent_inbound_jobs") {
    // Partial unique: at most one LIVE job per dedup key (mirrors the
    // migration index on status IN ('queued','running')).
    if (row.status === "queued" || row.status === "running") {
      keys.push(`job:live:${String(row.dedupKey)}`);
    }
  }
  if (table === "channel_events") {
    keys.push(
      `evt:${String(row.provider)}|${String(row.channelAccountId ?? "")}|${String(
        row.deliveryId
      )}`
    );
  }
  if (table === "products" && row.sku) keys.push(`sku:${String(row.sku)}`);
  return keys;
}

interface ConflictUpdate {
  set?: Row;
}

class QueryBuilder implements PromiseLike<unknown> {
  private readonly db: FakeDb;
  private readonly op: "select" | "insert" | "update" | "delete";
  private table: string;
  private whereExpr: unknown;
  private limitCount: number | undefined;
  private orderSpec: unknown[] = [];
  private inserted: Row | Row[] | undefined;
  private updated: Row | undefined;
  private ignoreConflict = false;
  private conflictUpdate: ConflictUpdate | undefined;
  private projected = false;
  private readonly joins: { table: string; condition: unknown }[] = [];

  constructor(db: FakeDb, op: QueryBuilder["op"], table: string) {
    this.db = db;
    this.op = op;
    this.table = table;
  }

  from(table: unknown): this {
    this.table = getTableName(table as never);
    return this;
  }

  innerJoin(table: unknown, condition: unknown): this {
    this.joins.push({ table: getTableName(table as never), condition });
    return this;
  }

  where(expr: unknown): this {
    this.whereExpr = expr;
    return this;
  }

  orderBy(...columns: unknown[]): this {
    this.orderSpec = columns;
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  values(values: Row | Row[]): this {
    this.inserted = values;
    return this;
  }

  set(values: Row): this {
    this.updated = values;
    return this;
  }

  returning(..._columns: unknown[]): this {
    this.projected = true;
    return this;
  }

  onConflictDoNothing(): this {
    this.ignoreConflict = true;
    return this;
  }

  onConflictDoUpdate(config: ConflictUpdate): this {
    this.conflictUpdate = config;
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private sortRows(rows: Row[]): Row[] {
    if (this.orderSpec.length === 0) return rows;
    const sorted = [...rows];
    for (const spec of this.orderSpec) {
      if (!isSqlNode(spec)) continue;
      const column = firstColumn(spec);
      if (!column) continue;
      const desc = /\bdesc\b/.test(textOf(spec).toLowerCase());
      const key = camelName(column);
      sorted.sort((a, b) => {
        const left = a[key] as number | Date;
        const right = b[key] as number | Date;
        if (left === right) return 0;
        return (left > right ? 1 : -1) * (desc ? -1 : 1);
      });
    }
    return sorted;
  }

  private async execute(): Promise<unknown> {
    if (this.op === "select") {
      let rows = this.db.rows(this.table);
      for (const join of this.joins) {
        const joined = this.db.rows(join.table);
        rows = rows.flatMap((base) =>
          joined.map((other) => ({ ...base, ...other })).filter((row) => evaluate(join.condition, row))
        );
      }
      rows = this.sortRows(rows.filter((row) => evaluate(this.whereExpr, row)));
      return this.limitCount != null ? rows.slice(0, this.limitCount) : rows;
    }
    if (this.op === "insert") {
      // Drizzle accepts a single row or an array (multi-row insert).
      const rowsToInsert = Array.isArray(this.inserted)
        ? this.inserted
        : [this.inserted ?? {}];
      const insertedRows: Row[] = [];
      for (const values of rowsToInsert) {
        const result = this.db.insertRow(this.table, values, {
          ignoreConflict: this.ignoreConflict,
          conflictUpdate: this.conflictUpdate,
        });
        if (result.row) insertedRows.push(result.row);
      }
      if (this.projected) return insertedRows;
      return { rowCount: insertedRows.length };
    }
    if (this.op === "update") {
      return this.db.updateRows(this.table, this.updated ?? {}, this.whereExpr);
    }
    const removed = this.db.deleteRows(this.table, this.whereExpr);
    return this.projected ? removed : { rowCount: removed.length };
  }
}

export class FakeDb {
  private tables = new Map<string, Row[]>();
  private sequences = new Map<string, number>();
  /** Tables whose next insert throws (transient persistence failure). */
  private readonly poisoned = new Set<string>();
  /** Append-only trace of writes, for "no DB touched" assertions. */
  readonly writes: string[] = [];

  seed(table: unknown, rows: Row[]): void {
    const name = getTableName(table as never);
    this.tables.set(name, rows.map((row) => ({ ...row })));
    const max = rows.reduce((current, row) => Math.max(current, Number(row.id ?? 0)), 0);
    this.sequences.set(name, max);
  }

  rows(table: string): Row[] {
    let rows = this.tables.get(table);
    if (!rows) {
      rows = [];
      this.tables.set(table, rows);
    }
    return rows;
  }

  reset(): void {
    this.tables = new Map();
    this.sequences = new Map();
    this.poisoned.clear();
    this.writes.length = 0;
  }

  poison(table: unknown): void {
    this.poisoned.add(getTableName(table as never));
  }

  unpoison(table: unknown): void {
    this.poisoned.delete(getTableName(table as never));
  }

  insertRow(
    table: string,
    values: Row,
    options: { ignoreConflict: boolean; conflictUpdate: ConflictUpdate | undefined }
  ): { row: Row | null } {
    if (this.poisoned.has(table)) {
      throw Object.assign(new Error(`injected failure inserting into ${table}`), {
        code: "08006",
      });
    }
    if (!this.tables.has(table)) this.tables.set(table, []);
    const rows = this.rows(table);
    const keys = uniqueKeys(table, values);
    const existing = rows.find((row) =>
      uniqueKeys(table, row).some((key) => keys.includes(key))
    );
    if (existing) {
      if (options.conflictUpdate?.set) {
        for (const [key, value] of Object.entries(options.conflictUpdate.set)) {
          existing[key] = resolveSetValue(existing, key, value);
        }
        this.writes.push(`upsert:${table}`);
        return { row: existing };
      }
      if (options.ignoreConflict) return { row: null };
      const error = Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
      });
      throw error;
    }
    const id = values.id ?? randomUUID();
    this.sequences.set(table, Number(id));
    const row: Row = { ...values, id };
    if ("createdAt" in row === false && table !== "idempotency_keys") row.createdAt = new Date();
    rows.push(row);
    this.writes.push(`insert:${table}`);
    return { row };
  }

  updateRows(table: string, values: Row, whereExpr: unknown): Row[] {
    const updated: Row[] = [];
    for (const row of this.rows(table)) {
      if (!evaluate(whereExpr, row)) continue;
      for (const [key, value] of Object.entries(values)) {
        row[key] = resolveSetValue(row, key, value);
      }
      updated.push(row);
    }
    if (updated.length > 0) this.writes.push(`update:${table}`);
    return updated;
  }

  deleteRows(table: string, whereExpr: unknown): Row[] {
    const rows = this.rows(table);
    const removed: Row[] = [];
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (!evaluate(whereExpr, rows[i])) continue;
      removed.push(rows[i]);
      rows.splice(i, 1);
    }
    if (removed.length > 0) this.writes.push(`delete:${table}`);
    return removed;
  }

  /** Transaction with rollback: on throw, every table is restored. */
  async runTransaction<T>(callback: (tx: FakeDb) => Promise<T>): Promise<T> {
    const snapshot = new Map<string, Row[]>();
    for (const [table, rows] of this.tables) {
      snapshot.set(
        table,
        rows.map((row) => ({ ...row }))
      );
    }
    try {
      return await callback(this);
    } catch (error) {
      this.tables = snapshot;
      throw error;
    }
  }

  select(): QueryBuilder {
    return new QueryBuilder(this, "select", "");
  }

  // Drizzle transaction-handle shape (`tx.insert/update/delete`).
  insert(table: unknown): QueryBuilder {
    return this.insertInto(table);
  }

  update(table: unknown): QueryBuilder {
    return this.updateTable(table);
  }

  delete(table: unknown): QueryBuilder {
    return this.deleteFrom(table);
  }

  insertInto(table: unknown): QueryBuilder {
    return new QueryBuilder(this, "insert", getTableName(table as never));
  }

  updateTable(table: unknown): QueryBuilder {
    return new QueryBuilder(this, "update", getTableName(table as never));
  }

  deleteFrom(table: unknown): QueryBuilder {
    return new QueryBuilder(this, "delete", getTableName(table as never));
  }
}

type ModuleLoader = {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

/**
 * Replace one or more module specifiers for the rest of this process. Must run
 * BEFORE the modules under test are required (see the tests: the DB modules are
 * loaded with `require()` after the intercepts are installed).
 */
export function installModuleIntercepts(
  intercepts: Record<string, () => unknown>
): () => void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const NodeModule = require("node:module") as ModuleLoader;
  const previous = NodeModule._load;
  NodeModule._load = function (request, parent, isMain) {
    const factory = intercepts[request];
    if (factory) return factory();
    return previous.call(this, request, parent, isMain);
  };
  return () => {
    NodeModule._load = previous;
  };
}

/** Installs the fake DB on `@/db/client` + `@/lib/db-transaction`. */
export function installFakeDb(fake: FakeDb): () => void {
  // Dynamic import() resolves `@/lib/db-transaction` to test/stubs, which
  // reads the active fake from here (Module._load cannot intercept it).
  (globalThis as unknown as { __FAKE_DB__?: FakeDb }).__FAKE_DB__ = fake;
  return installModuleIntercepts({
    "@/db/client": () => ({
      db: {
        select: () => fake.select(),
        insert: (table: unknown) => fake.insertInto(table),
        update: (table: unknown) => fake.updateTable(table),
        delete: (table: unknown) => fake.deleteFrom(table),
      },
      schema: {},
    }),
    "@/lib/db-transaction": () => ({
      withDbTransaction: <T>(callback: (tx: FakeDb) => Promise<T>) =>
        fake.runTransaction(callback),
    }),
  });
}
