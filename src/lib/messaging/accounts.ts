/**
 * Channel account resolver — the read seam between an account store and the
 * messaging contract's `ChannelAccount`.
 *
 * Port of SocialCRM `src/lib/messaging/accounts.ts`, adapted for the seam
 * constraint: AH's `channel_accounts`/`lead_identities` tables are being
 * created by a PARALLEL worktree, so this module must not import
 * `channelAccounts` from `@/db/schema`. Instead, account reads go through
 * the `ChannelAccountStore` interface; the DEFAULT store materializes rows
 * from provider env vars (the migration-tolerant "legacy single-account"
 * path SocialCRM documented in S11). The parallel wave swaps in a DB-backed
 * store via `setChannelAccountStore(...)` without touching provider code.
 *
 * Resolution is strict and account-aware (unchanged semantics):
 * - candidates are matched by canonical (+/digits) comparison against
 *   `providerAccountId` and `senderAddress`;
 * - only `active` rows with a registered provider participate;
 * - an expected provider must match the row provider (present-but-mismatched
 *   is a hard mismatch, never a fallback);
 * - a provisioned channel with no matching row is `not-found` (fail closed);
 * - store failures surface as `db-error` (retryable), never degrade.
 *
 * Env-scoped provider fallback (AH-only, documented): when candidate
 * matching finds nothing BUT the event's provider is known AND exactly one
 * active env-materialized row exists for (channel, provider), that row
 * binds. Sound because an env install's webhook secret is install-global —
 * a verified signature already proves the event belongs to this install's
 * account for that provider (ycloud's wabaId is the one routing key env
 * installs can't declare; `YCLOUD_WABA_ID` may be set to make it explicit).
 * DB-backed rows (non `env:` credentialsRef) NEVER use this fallback.
 */

import { decryptIfEncrypted } from "@/lib/crypto/secret-box";

import { isRetryableDbError, isSchemaNotReady } from "./errors";
import { phoneMatches } from "./phone";
import {
  isChannelKind,
  isProviderId,
  providerForChannel,
} from "./registry";
import type { ChannelAccount, ChannelKind, ProviderId } from "./types";

/**
 * Store row — the shape a `channel_accounts` table will provide. Plain
 * interface (no drizzle import) so the seam compiles without the future
 * schema symbols.
 */
export interface ChannelAccountRow {
  id: string;
  tenantId: string;
  provider: string;
  channel: string;
  /** ycloud wabaId · zernio accountId · kapso phone_number_id */
  providerAccountId: string;
  /** Business sender (E.164 phone / page id / handle). */
  senderAddress: string;
  /** `env:PREFIX` (or `env`/`agent_config` legacy sentinel) → env resolution. */
  credentialsRef: string | null;
  status: string;
}

/** Replaceable read seam — see file header. Implementations must not throw
 *  schema/auth surprises: transient failures SHOULD throw (they classify as
 *  `db-error`, retryable). */
export interface ChannelAccountStore {
  listByChannel(channel: ChannelKind): Promise<ChannelAccountRow[]>;
  findById(id: string): Promise<ChannelAccountRow | null>;
}

export type ChannelAccountResolution =
  | {
      kind: "resolved";
      account: ChannelAccount;
      rowId: string;
      provider: ProviderId;
      channel: ChannelKind;
    }
  /** No active rows provisioned for the channel — legacy install. */
  | { kind: "unprovisioned" }
  /** Rows exist but none matches the presented identity. */
  | { kind: "not-found"; candidates: string[] }
  /** A match exists but its provider/channel/account context disagrees. */
  | { kind: "mismatch"; reason: string }
  /** Positive evidence that the backing schema has not been migrated. */
  | { kind: "schema-not-ready"; error: unknown }
  /** Transient failure — caller must retry, never degrade. */
  | { kind: "db-error"; error: unknown };

/**
 * Symbolic (non-store-row) account ids. `env:*` ids materialize from the
 * environment — they are not `channel_accounts` rows and keep the legacy
 * null partition until the schema wave swaps in real row uuids.
 */
const SYMBOLIC_ACCOUNT_SUFFIXES = [":agent-config", ":caller-resolved"] as const;

export function isSymbolicAccountId(id: string | null | undefined): boolean {
  if (!id) return true;
  if (id.startsWith("env:")) return true;
  return SYMBOLIC_ACCOUNT_SUFFIXES.some((suffix) => id.endsWith(suffix));
}

/**
 * The store-row id of a resolved account, for account-scoped buffer/dedup
 * keys and future `channel_account_id` stamping. Symbolic placeholders keep
 * the legacy unscoped key shape (undefined).
 */
export function channelAccountRowId(
  account: ChannelAccount | undefined
): string | undefined {
  return account && !isSymbolicAccountId(account.id)
    ? account.id
    : undefined;
}

// ─── Env-backed default store ────────────────────────────────────────────

function envValue(env: EnvRecord, name: string): string {
  return env[name]?.trim() ?? "";
}

type EnvRecord = Record<string, string | undefined>;

/**
 * Materializes one row per provisioned provider, all-or-nothing per
 * provider: a row exists ONLY when its send credential is declared, so a
 * materialized row can never resolve to empty credentials downstream.
 * Rows carry `credentialsRef: "env:PREFIX"` — resolution re-reads the env
 * at send time (rotation without redeployed rows).
 */
function envRows(env: EnvRecord): ChannelAccountRow[] {
  const rows: ChannelAccountRow[] = [];

  const ycloudKey = envValue(env, "YCLOUD_API_KEY");
  const ycloudSender = envValue(env, "WHATSAPP_PHONE_NUMBER");
  if (ycloudKey && ycloudSender) {
    rows.push({
      id: "env:ycloud",
      tenantId: "default",
      provider: "ycloud",
      channel: "whatsapp",
      // The routing key YCloud stamps on events is the wabaId — declarable
      // via YCLOUD_WABA_ID; absent, the sender phone is the best candidate.
      providerAccountId:
        envValue(env, "YCLOUD_WABA_ID") || ycloudSender,
      senderAddress: ycloudSender,
      credentialsRef: "env:YCLOUD_",
      status: "active",
    });
  }

  const kapsoKey = envValue(env, "KAPSO_API_KEY");
  const kapsoPhoneNumberId = envValue(env, "KAPSO_PHONE_NUMBER_ID");
  if (kapsoKey && kapsoPhoneNumberId) {
    rows.push({
      id: "env:kapso",
      tenantId: "default",
      provider: "kapso",
      channel: "whatsapp",
      providerAccountId: kapsoPhoneNumberId,
      senderAddress: envValue(env, "KAPSO_SENDER_ADDRESS"),
      credentialsRef: "env:KAPSO_",
      status: "active",
    });
  }

  const zernioKey = envValue(env, "ZERNIO_API_KEY");
  const zernioAccountId = envValue(env, "ZERNIO_ACCOUNT_ID");
  const zernioChannel = envValue(env, "ZERNIO_CHANNEL");
  if (zernioKey && zernioAccountId && isChannelKind(zernioChannel)) {
    rows.push({
      id: "env:zernio",
      tenantId: "default",
      provider: "zernio",
      channel: zernioChannel,
      providerAccountId: zernioAccountId,
      senderAddress:
        envValue(env, "ZERNIO_SENDER_ADDRESS") ||
        envValue(env, "ZERNIO_PROFILE_ID"),
      credentialsRef: "env:ZERNIO_",
      status: "active",
    });
  }

  return rows;
}

/**
 * The default account store: env-materialized rows. Install-scoped by
 * definition — a verified provider signature plus these rows fully
 * identifies the install's account per (provider, channel).
 */
export function createEnvAccountStore(
  env: EnvRecord = process.env
): ChannelAccountStore {
  return {
    async listByChannel(channel) {
      return envRows(env).filter((row) => row.channel === channel);
    },
    async findById(id) {
      return envRows(env).find((row) => row.id === id) ?? null;
    },
  };
}

let accountStore: ChannelAccountStore = createEnvAccountStore();

/**
 * The DB-backed resolver's swap point (owned by the channel-accounts wave).
 * Pass the env factory result back to restore the default.
 */
export function setChannelAccountStore(store: ChannelAccountStore): void {
  accountStore = store;
}

export function getChannelAccountStore(): ChannelAccountStore {
  return accountStore;
}

// ─── Credential resolution ──────────────────────────────────────────────

function toAccountStatus(value: string): ChannelAccount["status"] {
  return value === "disconnected" || value === "error" ? value : "active";
}

/** A scoped account exists but has no usable credential. Fail closed. */
export class MissingScopedCredentialError extends Error {
  readonly accountId: string;

  constructor(accountId: string, detail: string) {
    super(`channel account ${accountId} has no usable credential (${detail})`);
    this.name = "MissingScopedCredentialError";
    this.accountId = accountId;
  }
}

/**
 * `env:PREFIX(*)` resolves API_KEY/ACCESS_TOKEN/WEBHOOK_SECRET from the
 * environment. A ref that yields no send credential at all is a
 * misconfigured account — fail closed instead of materializing empty
 * credentials that would delegate to the install-global sender downstream.
 */
function credentialsFromEnv(
  row: ChannelAccountRow,
  ref: string
): ChannelAccount["credentials"] {
  const prefix = ref.slice("env:".length).replace(/\*$/, "");
  const apiKey = process.env[`${prefix}API_KEY`] ?? "";
  const accessToken = process.env[`${prefix}ACCESS_TOKEN`] ?? "";
  if (!apiKey && !accessToken) {
    throw new MissingScopedCredentialError(
      row.id,
      `credentialsRef '${ref}' resolves to empty credentials`
    );
  }
  return {
    apiKey,
    webhookSecret: process.env[`${prefix}WEBHOOK_SECRET`] ?? "",
    ...(accessToken ? { accessToken } : {}),
  };
}

/**
 * Replaces SocialCRM's `credentialsFromAgentConfig` — AH has no
 * `agent_config` credential columns; unset/`agent_config`/`env` refs resolve
 * through the provider's own env scope so a per-account key is actually
 * used. A blank key is an explicit failure, never a silent global fallback.
 *
 * Stored values may arrive secret-box encrypted (the channel-accounts wave
 * stores credentials with `encryptSecret`) — `decryptIfEncrypted` keeps the
 * read migration-tolerant.
 */
function credentialsFromProviderScope(
  row: ChannelAccountRow
): ChannelAccount["credentials"] {
  const scope = row.provider.toUpperCase();
  const apiKey = decryptIfEncrypted(process.env[`${scope}_API_KEY`] ?? "");
  const accessToken = decryptIfEncrypted(
    process.env[`${scope}_ACCESS_TOKEN`] ?? ""
  );
  if (!apiKey && !accessToken) {
    throw new MissingScopedCredentialError(
      row.id,
      `no scoped ${scope}_API_KEY/${scope}_ACCESS_TOKEN in environment`
    );
  }
  return {
    apiKey,
    webhookSecret: decryptIfEncrypted(
      process.env[`${scope}_WEBHOOK_SECRET`] ?? ""
    ),
    ...(accessToken ? { accessToken } : {}),
  };
}

function resolveCredentials(
  row: ChannelAccountRow
): ChannelAccount["credentials"] {
  const ref = row.credentialsRef?.trim();
  if (!ref || ref === "env" || ref === "agent_config") {
    // `agent_config` is the legacy SocialCRM sentinel; AH resolves it through
    // the provider env scope — the channel-accounts wave may carry the ref
    // forward during migration.
    return credentialsFromProviderScope(row);
  }
  if (ref.startsWith("env:")) return credentialsFromEnv(row, ref);
  // Unknown refs (vault:, ssm:, typos) must NOT silently materialize an
  // empty-credential account — that's a fail-open into the global sender.
  throw new MissingScopedCredentialError(
    row.id,
    `unknown credentialsRef '${ref}'`
  );
}

async function rowToAccount(
  row: ChannelAccountRow
): Promise<ChannelAccount | undefined> {
  if (!isProviderId(row.provider) || !isChannelKind(row.channel)) return undefined;
  return {
    id: String(row.id),
    tenantId: row.tenantId,
    provider: row.provider,
    channel: row.channel,
    providerAccountId: row.providerAccountId,
    senderAddress: row.senderAddress,
    credentials: resolveCredentials(row),
    status: toAccountStatus(row.status),
  };
}

function classifyRowsError(
  channel: ChannelKind,
  error: unknown
): ChannelAccountResolution {
  if (isSchemaNotReady(error)) {
    console.warn(
      `[messaging] channel account schema not ready for '${channel}' — legacy compatibility path`
    );
    return { kind: "schema-not-ready", error };
  }
  console.error(
    isRetryableDbError(error)
      ? `[messaging] channel account lookup failed for '${channel}' — retryable`
      : `[messaging] channel account lookup failed for '${channel}'`,
    error
  );
  return { kind: "db-error", error };
}

export function rowMatchesCandidate(
  row: Pick<ChannelAccountRow, "providerAccountId" | "senderAddress">,
  candidate: string
): boolean {
  if (!candidate) return false;
  return (
    row.providerAccountId === candidate ||
    phoneMatches(candidate, row.providerAccountId) ||
    phoneMatches(candidate, row.senderAddress)
  );
}

function matchRows(
  rows: readonly ChannelAccountRow[],
  candidates: readonly string[]
): ChannelAccountRow[] {
  return rows.filter((row) =>
    candidates.some((candidate) => rowMatchesCandidate(row, candidate))
  );
}

function isEnvScopedRow(row: ChannelAccountRow): boolean {
  return row.credentialsRef?.trim().startsWith("env:") ?? false;
}

/**
 * Strict account resolution for an inbound/reply event. `candidates` may
 * contain the provider routing key and the business self-address in any
 * (+/digits) form; duplicates collapse.
 */
export async function resolveChannelAccountStrict(
  channel: ChannelKind,
  candidates: readonly string[],
  expectedProvider?: ProviderId
): Promise<ChannelAccountResolution> {
  let rows: ChannelAccountRow[];
  try {
    rows = await accountStore.listByChannel(channel);
  } catch (error) {
    return classifyRowsError(channel, error);
  }

  if (rows.length === 0) return { kind: "unprovisioned" };

  const active = rows.filter(
    (row) =>
      row.status === "active" &&
      isProviderId(row.provider) &&
      isChannelKind(row.channel)
  );
  if (active.length === 0) {
    return { kind: "not-found", candidates: [...candidates] };
  }

  const uniqueCandidates = [...new Set(candidates.filter((c) => c.length > 0))];
  if (uniqueCandidates.length === 0 && active.length > 1) {
    return {
      kind: "mismatch",
      reason: "multiple active accounts and no routing key",
    };
  }

  let matched = uniqueCandidates.length
    ? matchRows(active, uniqueCandidates)
    : active.slice(0, 1);

  if (matched.length === 0 && expectedProvider) {
    // AH env fallback: a signature-verified event from `expectedProvider`
    // belongs to the install's single env account for (channel, provider).
    // Covers routing keys env can't declare (ycloud wabaId). Restricted to
    // env-scoped rows — DB-backed multi-account installs keep strict
    // candidate matching and fail closed here.
    const envScoped = active.filter(
      (row) => isEnvScopedRow(row) && row.provider === expectedProvider
    );
    if (envScoped.length === 1) matched = envScoped;
  }

  if (matched.length === 0) {
    return { kind: "not-found", candidates: uniqueCandidates };
  }

  const distinct = [...new Map(matched.map((row) => [row.id, row])).values()];
  if (distinct.length > 1) {
    return { kind: "mismatch", reason: "routing key matches multiple accounts" };
  }

  const row = distinct[0];
  if (expectedProvider && row.provider !== expectedProvider) {
    return {
      kind: "mismatch",
      reason: `account ${row.id} provider '${row.provider}' != event provider '${expectedProvider}'`,
    };
  }
  if (!isProviderId(row.provider)) {
    return { kind: "mismatch", reason: `unregistered provider '${row.provider}'` };
  }
  if (!isChannelKind(row.channel)) {
    return { kind: "mismatch", reason: `account ${row.id} has invalid channel` };
  }

  let account: ChannelAccount | undefined;
  try {
    account = await rowToAccount(row);
  } catch (error) {
    if (error instanceof MissingScopedCredentialError) {
      return { kind: "mismatch", reason: error.message };
    }
    throw error;
  }
  if (!account) {
    return { kind: "mismatch", reason: `account ${row.id} cannot be materialized` };
  }
  return {
    kind: "resolved",
    account,
    rowId: row.id,
    provider: row.provider,
    channel: row.channel,
  };
}

/** Strict lookup by primary key (conversation binding / operator send). */
export async function resolveChannelAccountByIdStrict(
  accountId: string,
  expectedProvider?: ProviderId
): Promise<ChannelAccountResolution> {
  let row: ChannelAccountRow | null;
  try {
    row = await accountStore.findById(accountId);
  } catch (error) {
    return classifyRowsError("whatsapp", error);
  }
  if (!row) return { kind: "not-found", candidates: [String(accountId)] };
  if (row.status !== "active") {
    return { kind: "not-found", candidates: [String(accountId)] };
  }
  if (!isProviderId(row.provider) || !isChannelKind(row.channel)) {
    return { kind: "mismatch", reason: `account ${accountId} has invalid provider/channel` };
  }
  if (expectedProvider && row.provider !== expectedProvider) {
    return {
      kind: "mismatch",
      reason: `account ${accountId} provider '${row.provider}' != expected '${expectedProvider}'`,
    };
  }
  let account: ChannelAccount | undefined;
  try {
    account = await rowToAccount(row);
  } catch (error) {
    if (error instanceof MissingScopedCredentialError) {
      return { kind: "mismatch", reason: error.message };
    }
    throw error;
  }
  return account
    ? {
        kind: "resolved",
        account,
        rowId: row.id,
        provider: row.provider,
        channel: row.channel,
      }
    : { kind: "mismatch", reason: `account ${accountId} cannot be materialized` };
}

/** Identical shape to messenger.ts's placeholder — carries no secrets. */
function fallbackAccount(channel: ChannelKind): ChannelAccount | undefined {
  const provider = providerForChannel(channel);
  if (!provider) return undefined;
  return {
    id: `${channel}:agent-config`,
    tenantId: "default",
    provider: provider.id,
    channel,
    providerAccountId: "",
    senderAddress: "",
    credentials: { apiKey: "", webhookSecret: "" },
    status: "active",
  };
}

/**
 * The legacy placeholder is stamped with the channel's routed provider
 * (whatsapp → ycloud in v1) and exists only to keep un-provisioned or
 * un-migrated YCLOUD installs working. A caller expecting another
 * provider must never receive it — non-ycloud providers have no legacy
 * installs, so an unprovisioned/schema-not-ready channel fails closed.
 */
export function legacyFallbackAccount(
  channel: ChannelKind,
  expectedProvider?: ProviderId
): ChannelAccount | undefined {
  const fallback = fallbackAccount(channel);
  if (expectedProvider && fallback?.provider !== expectedProvider) {
    return undefined;
  }
  return fallback;
}

export class ChannelAccountResolutionError extends Error {
  readonly retryable: boolean;
  readonly resolution: ChannelAccountResolution;

  constructor(
    resolution: Exclude<ChannelAccountResolution, { kind: "resolved" }>
  ) {
    super(
      resolution.kind === "db-error"
        ? "channel account resolution failed (retryable)"
        : resolution.kind === "mismatch"
          ? resolution.reason
          : resolution.kind === "not-found"
            ? "no channel account matches the presented identity"
            : `channel account resolution: ${resolution.kind}`
    );
    this.name = "ChannelAccountResolutionError";
    this.retryable = resolution.kind === "db-error";
    this.resolution = resolution;
  }
}

/**
 * Compatibility wrapper for callers that only need an account. Legacy
 * placeholder is used for a truly unprovisioned channel or a positively
 * identified missing schema. Not-found/mismatch return undefined (fail
 * closed); transient errors throw a retryable error.
 */
export async function resolveChannelAccount(
  channel: ChannelKind,
  providerAccountId?: string,
  expectedProvider?: ProviderId
): Promise<ChannelAccount | undefined> {
  const resolution = await resolveChannelAccountStrict(
    channel,
    providerAccountId ? [providerAccountId] : [],
    expectedProvider
  );
  switch (resolution.kind) {
    case "resolved":
      return resolution.account;
    case "unprovisioned":
    case "schema-not-ready":
      return legacyFallbackAccount(channel, expectedProvider);
    case "db-error":
      throw new ChannelAccountResolutionError(resolution);
    case "not-found":
    case "mismatch":
      return undefined;
  }
}

/**
 * Compatibility wrapper for conversation-bound sends. Missing/inactive rows
 * return undefined; transient store errors throw.
 */
export async function resolveChannelAccountById(
  accountId: string,
  expectedProvider?: ProviderId
): Promise<ChannelAccount | undefined> {
  const resolution = await resolveChannelAccountByIdStrict(
    accountId,
    expectedProvider
  );
  if (resolution.kind === "resolved") return resolution.account;
  if (resolution.kind === "db-error") {
    throw new ChannelAccountResolutionError(resolution);
  }
  return undefined;
}

export type SenderAccountMatch =
  | { kind: "matched"; account: ChannelAccount }
  /** No active rows for the channel (or a truly un-migrated install). */
  | { kind: "unprovisioned" }
  /** Rows exist but none matches the sender — foreign account, fail closed. */
  | { kind: "unmatched" }
  | { kind: "mismatch"; reason: string }
  | { kind: "db-error"; error: unknown };

/**
 * Pure matcher — the business-side sender of an echo/self-send must equal an
 * active row's `senderAddress` or `providerAccountId` (digit-normalized for
 * E.164), or carry the row's `providerAccountId` verbatim (wabaId et al.).
 */
export function matchSenderInRows(
  rows: readonly ChannelAccountRow[],
  sender: { senderAddress?: string; providerAccountId?: string }
): ChannelAccountRow | undefined {
  const candidates = [sender.providerAccountId, sender.senderAddress].filter(
    (candidate): candidate is string => Boolean(candidate)
  );
  const matches = matchRows(rows, candidates);
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Attribute an outbound/echo event's business-side sender to a provisioned
 * account row. Tri-state so callers can keep the legacy phone-only flow only
 * on an unprovisioned/un-migrated install while refusing foreign senders and
 * surfacing retryable store failures. Env installs get the same
 * provider-scoped fallback as resolveChannelAccountStrict.
 */
export async function matchSenderToChannelAccount(
  channel: ChannelKind,
  sender: { senderAddress?: string; providerAccountId?: string },
  expectedProvider?: ProviderId
): Promise<SenderAccountMatch> {
  const candidates = [sender.providerAccountId, sender.senderAddress].filter(
    (candidate): candidate is string => Boolean(candidate)
  );
  const resolution = await resolveChannelAccountStrict(
    channel,
    candidates,
    expectedProvider
  );
  switch (resolution.kind) {
    case "resolved":
      return { kind: "matched", account: resolution.account };
    case "unprovisioned":
    case "schema-not-ready":
      // Positive evidence only: legacy installs keep today's behavior.
      return { kind: "unprovisioned" };
    case "db-error":
      return { kind: "db-error", error: resolution.error };
    case "not-found":
      return { kind: "unmatched" };
    case "mismatch":
      return { kind: "mismatch", reason: resolution.reason };
  }
}
