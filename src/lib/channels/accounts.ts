import "server-only";

import { timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { channelAccounts } from "@/db/schema";
import { decryptIfEncrypted } from "@/lib/crypto/secret-box";

import {
  fetchLegacyGlobalAgentConfig,
  firstScopedValue,
  resolveAgentConfigChain,
  type AgentConfigRow,
} from "./agent-config-scope";
import { isRetryableDbError, isSchemaNotReady } from "./errors";
import { phoneMatches } from "./phone";
import {
  isChannelKind,
  isProviderId,
  providerForChannel,
} from "./registry";
import type { Channel, ChannelAccount, ProviderId } from "./types";

/**
 * Channel account resolver — the read seam between the `channel_accounts`
 * table and the channel contract's `ChannelAccount`.
 *
 * Resolution is strict and account-aware:
 * - candidates are matched by canonical (+/digits) comparison against
 *   `providerAccountId` and `senderAddress`;
 * - only `active` rows with a registered provider participate;
 * - an expected provider must match the row provider (present-but-mismatched
 *   is a hard mismatch, never a fallback);
 * - a provisioned channel with no matching row is `not-found` (fail closed);
 * - only a positively identified missing schema (un-migrated install) may use
 *   the legacy placeholder. Arbitrary DB errors are surfaced as retryable.
 */

export type ChannelAccountRow = typeof channelAccounts.$inferSelect;

export type ChannelAccountResolution =
  | {
      kind: "resolved";
      account: ChannelAccount;
      /** channel_accounts primary key (uuid string). */
      rowId: string;
      provider: ProviderId;
      channel: Channel;
    }
  /** No active rows provisioned for the channel — legacy install. */
  | { kind: "unprovisioned" }
  /** Rows exist but none matches the presented identity. */
  | { kind: "not-found"; candidates: string[] }
  /** A match exists but its provider/channel/account context disagrees. */
  | { kind: "mismatch"; reason: string }
  /** Positive evidence that the migration has not run. */
  | { kind: "schema-not-ready"; error: unknown }
  /** Transient failure — caller must retry, never degrade. */
  | { kind: "db-error"; error: unknown };

function toAccountStatus(value: string): ChannelAccount["status"] {
  return value === "disconnected" || value === "error" ? value : "active";
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

/** A scoped account exists but has no usable credential. Fail closed. */
export class MissingScopedCredentialError extends Error {
  readonly accountId: string;

  constructor(accountId: string, detail: string) {
    super(`channel_accounts '${accountId}' has no usable credential (${detail})`);
    this.name = "MissingScopedCredentialError";
    this.accountId = accountId;
  }
}

/**
 * A-15 — per-provider credential columns on the scoped `agent_config` row.
 * Dedicated `<provider>*Enc` fields win, then the generic
 * `providerKeyEnc`/`webhookSecretEnc` (and `botTokenEnc` for telegram), then
 * the provider env scope (`<PROVIDER>_API_KEY`/`ACCESS_TOKEN`/
 * `WEBHOOK_SECRET`).
 *
 * R4-MED-2 — both the dedicated and the generic lookups walk the whole scope
 * chain per FIELD (account → channel → global): an account row that only
 * carries `enabled` no longer hides a parent scope's credential.
 */
const SCOPED_PROVIDER_FIELDS: Record<
  string,
  {
    apiKey: "ycloudApiKeyEnc" | "kapsoApiKeyEnc" | "zernioApiKeyEnc";
    webhookSecret:
      | "ycloudWebhookSecretEnc"
      | "kapsoWebhookSecretEnc"
      | "zernioWebhookSecretEnc";
  }
> = {
  ycloud: { apiKey: "ycloudApiKeyEnc", webhookSecret: "ycloudWebhookSecretEnc" },
  kapso: { apiKey: "kapsoApiKeyEnc", webhookSecret: "kapsoWebhookSecretEnc" },
  zernio: { apiKey: "zernioApiKeyEnc", webhookSecret: "zernioWebhookSecretEnc" },
};

function decryptColumn(value: unknown): string {
  return typeof value === "string" ? decryptIfEncrypted(value) : "";
}

/** Last-resort env scope for `agent_config` refs with no scoped secrets. */
function credentialsFromProviderEnvScope(
  row: ChannelAccountRow
): ChannelAccount["credentials"] | null {
  const scope = row.provider.toUpperCase();
  const apiKey = decryptIfEncrypted(process.env[`${scope}_API_KEY`] ?? "");
  const accessToken = decryptIfEncrypted(
    process.env[`${scope}_ACCESS_TOKEN`] ?? ""
  );
  if (!apiKey && !accessToken) return null;
  return {
    apiKey,
    webhookSecret: decryptIfEncrypted(
      process.env[`${scope}_WEBHOOK_SECRET`] ?? ""
    ),
    ...(accessToken ? { accessToken } : {}),
  };
}

/**
 * `agent_config`/unset credentials resolve through the account's own scope so
 * a per-account credential is actually used (A-15): the scoped chain's
 * encrypted provider fields first, resolved per FIELD (account → channel →
 * global), the provider env scope second. Materializing empty credentials here
 * would bind the account fine but break every send far from the cause — fail
 * closed instead.
 */
async function credentialsFromAgentConfig(
  row: ChannelAccountRow
): Promise<ChannelAccount["credentials"]> {
  const resolution = await resolveAgentConfigChain({
    channel: row.channel,
    channelAccountId: row.id,
  });

  let configRows: AgentConfigRow[] = [];
  let source = "";
  switch (resolution.kind) {
    case "resolved":
      configRows = resolution.rows;
      source = resolution.sources
        .map((entry, index) => `${entry} row #${resolution.rows[index].id}`)
        .join(" -> ");
      break;
    case "schema-not-ready": {
      // Partial migration: scope columns missing — the legacy global row
      // still carries the generic credential fields, exactly like
      // pre-migration installs.
      const legacy = await fetchLegacyGlobalAgentConfig();
      configRows = legacy ? [legacy] : [];
      source = "global row (legacy read)";
      break;
    }
    case "not-found":
      configRows = [];
      break;
    case "db-error":
      // A transient DB error must not be silently replaced by other creds.
      throw resolution.error;
  }

  const scopedFields = SCOPED_PROVIDER_FIELDS[row.provider];
  const scopedApiKey =
    firstScopedValue(configRows, (config) =>
      decryptColumn(scopedFields ? config[scopedFields.apiKey] : null)
    ) || firstScopedValue(configRows, (config) => decryptColumn(config.providerKeyEnc));
  const scopedSecret =
    firstScopedValue(configRows, (config) =>
      decryptColumn(scopedFields ? config[scopedFields.webhookSecret] : null)
    ) || firstScopedValue(configRows, (config) => decryptColumn(config.webhookSecretEnc));
  const scopedToken =
    row.provider === "telegram"
      ? firstScopedValue(configRows, (config) => decryptColumn(config.botTokenEnc))
      : "";

  if (scopedApiKey || scopedToken) {
    return {
      apiKey: scopedApiKey,
      webhookSecret: scopedSecret,
      ...(scopedToken ? { accessToken: scopedToken } : {}),
    };
  }

  // No scoped secrets → provider env scope (env:PREFIX stays the explicit
  // form; this fallback keeps 'agent_config' rows working pre-migration).
  const envScoped = credentialsFromProviderEnvScope(row);
  if (envScoped) return envScoped;

  throw new MissingScopedCredentialError(
    row.id,
    `${source || "agent_config"} has no usable '${row.provider}' credential`
  );
}

async function resolveCredentials(
  row: ChannelAccountRow
): Promise<ChannelAccount["credentials"]> {
  const ref = row.credentialsRef?.trim();
  if (!ref || ref === "agent_config") {
    return credentialsFromAgentConfig(row);
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
    id: row.id,
    tenantId: row.tenantId,
    provider: row.provider,
    channel: row.channel,
    providerAccountId: row.providerAccountId,
    senderAddress: row.senderAddress,
    credentials: await resolveCredentials(row),
    status: toAccountStatus(row.status),
  };
}

function classifyRowsError(
  channel: Channel,
  error: unknown
): ChannelAccountResolution {
  if (isSchemaNotReady(error)) {
    console.warn(
      `[channels] channel_accounts schema not ready for '${channel}' — legacy compatibility path`
    );
    return { kind: "schema-not-ready", error };
  }
  console.error(
    isRetryableDbError(error)
      ? `[channels] channel_accounts lookup failed for '${channel}' — retryable`
      : `[channels] channel_accounts lookup failed for '${channel}'`,
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

/**
 * Strict account resolution for an inbound/reply event. `candidates` may
 * contain the provider routing key and the business self-address in any
 * (+/digits) form; duplicates collapse.
 */
export async function resolveChannelAccountStrict(
  channel: Channel,
  candidates: readonly string[],
  expectedProvider?: ProviderId
): Promise<ChannelAccountResolution> {
  let rows: ChannelAccountRow[];
  try {
    rows = await db
      .select()
      .from(channelAccounts)
      .where(eq(channelAccounts.channel, channel));
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

  const matched = uniqueCandidates.length
    ? matchRows(active, uniqueCandidates)
    : active.slice(0, 1);
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
      reason: `account '${row.id}' provider '${row.provider}' != event provider '${expectedProvider}'`,
    };
  }
  if (!isProviderId(row.provider)) {
    return { kind: "mismatch", reason: `unregistered provider '${row.provider}'` };
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
    return { kind: "mismatch", reason: `account '${row.id}' cannot be materialized` };
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
  let rows: ChannelAccountRow[];
  try {
    rows = await db
      .select()
      .from(channelAccounts)
      .where(eq(channelAccounts.id, accountId))
      .limit(1);
  } catch (error) {
    return classifyRowsError("whatsapp", error);
  }
  const row = rows[0];
  if (!row) return { kind: "not-found", candidates: [accountId] };
  if (row.status !== "active") {
    return { kind: "not-found", candidates: [accountId] };
  }
  if (!isProviderId(row.provider) || !isChannelKind(row.channel)) {
    return { kind: "mismatch", reason: `account '${accountId}' has invalid provider/channel` };
  }
  if (expectedProvider && row.provider !== expectedProvider) {
    return {
      kind: "mismatch",
      reason: `account '${accountId}' provider '${row.provider}' != expected '${expectedProvider}'`,
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
    : { kind: "mismatch", reason: `account '${accountId}' cannot be materialized` };
}

/** Placeholder for unprovisioned/legacy installs — carries no secrets. */
function fallbackAccount(channel: Channel): ChannelAccount | undefined {
  const provider = providerForChannel(channel);
  if (!provider) return undefined;
  return {
    id: `${channel}:agent-config`,
    tenantId: "default",
    provider,
    channel,
    providerAccountId: "",
    senderAddress: "",
    credentials: { apiKey: "", webhookSecret: "" },
    status: "active",
  };
}

/**
 * The legacy placeholder is stamped with the channel's routed provider
 * (whatsapp → ycloud, telegram → telegram in v1) and exists only to keep
 * un-provisioned or un-migrated installs working on the env-based paths. A
 * caller expecting another provider must never receive it — social channels
 * have no legacy installs, so an unprovisioned channel fails closed.
 */
export function legacyFallbackAccount(
  channel: Channel,
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
  channel: Channel,
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
 * return undefined; transient DB errors throw.
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

/**
 * Constant-time comparison for a per-account webhook secret. Fail-closed on
 * either side missing — an account without a configured secret can never be
 * matched by an empty/absent presented value.
 */
export function webhookSecretMatches(
  expected: string,
  presented: string
): boolean {
  if (!expected || !presented) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(presented, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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
 * E.164), or carry the row's `providerAccountId` verbatim.
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
 * `channel_accounts` row. Tri-state so callers can keep the legacy env-based
 * flow only on an unprovisioned/un-migrated install while refusing foreign
 * senders and surfacing retryable DB failures.
 */
export async function matchSenderToChannelAccount(
  channel: Channel,
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
