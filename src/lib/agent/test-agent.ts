import "server-only";

import {
  resolveAgentConfigStrict,
  type AgentConfigRow,
} from "@/lib/channels/agent-config-scope";
import { resolveDefaultChannelAccount } from "@/lib/channels/send-account";
import { decryptIfEncrypted } from "@/lib/crypto/secret-box";
import { resolveRuntimeFromConfig } from "@/lib/ai/config";
import type { Channel } from "@/lib/channels/types";

/**
 * B-06 — agent config self-test shared by `/api/agent/test` and
 * `/api/admin/test-agent`. Resolves the scoped agent runtime config and the
 * channel-account credentials (agent_config scoped secrets → env fallback),
 * then does a cheap provider ping that never sends a message. Output is a
 * status report only — no secret values ever leave this module.
 */

export type ProviderPing = "ok" | "invalid" | "error" | "skipped";

export interface ChannelTestReport {
  channel: Channel;
  status:
    | "resolved"
    | "unprovisioned"
    | "not-found"
    | "ambiguous"
    | "db-error";
  provider?: string;
  hasCredential: boolean;
  ping: ProviderPing;
  pingDetail?: string;
}

export interface AgentTestReport {
  ok: boolean;
  config: {
    resolved: boolean;
    scope: "global";
    source?: "account" | "channel" | "global";
    enabled: boolean | null;
    provider: string | null;
    model: string | null;
    hasSystemPrompt: boolean;
    enabledTools: number;
    aiConfigured: boolean;
    aiMissing: string[];
  };
  channels: ChannelTestReport[];
}

const PING_TIMEOUT_MS = 5_000;

async function pingHttp(
  url: string,
  headers: Record<string, string>
): Promise<{ status: number }> {
  const response = await fetch(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    cache: "no-store",
  });
  return { status: response.status };
}

/** 2xx/405 = reachable + authorized; 401/403 = bad credential; else error. */
function classifyStatus(status: number): ProviderPing {
  if (status === 401 || status === 403) return "invalid";
  if (status >= 200 && status < 500) return "ok";
  return "error";
}

/**
 * Cheap credential probe per provider — read-only endpoints only, never a
 * message send. Returns "skipped" for providers without a known probe.
 */
async function pingProvider(
  provider: string,
  credentials: { apiKey: string; accessToken?: string }
): Promise<{ ping: ProviderPing; detail?: string }> {
  try {
    switch (provider) {
      case "ycloud": {
        const { status } = await pingHttp(
          "https://api.ycloud.com/v2/whatsapp/messages",
          { "X-API-Key": credentials.apiKey }
        );
        return { ping: classifyStatus(status), detail: `HTTP ${status}` };
      }
      case "kapso": {
        const { status } = await pingHttp(
          "https://api.kapso.ai/meta/whatsapp/v24.0",
          { "X-API-Key": credentials.apiKey }
        );
        return { ping: classifyStatus(status), detail: `HTTP ${status}` };
      }
      case "zernio": {
        const { status } = await pingHttp("https://zernio.com/api/v1/accounts", {
          Authorization: `Bearer ${credentials.apiKey}`,
        });
        return { ping: classifyStatus(status), detail: `HTTP ${status}` };
      }
      case "telegram": {
        const token = credentials.accessToken ?? "";
        const { status } = await pingHttp(
          `https://api.telegram.org/bot${token}/getMe`,
          {}
        );
        return { ping: classifyStatus(status), detail: `HTTP ${status}` };
      }
      default:
        return { ping: "skipped" };
    }
  } catch {
    return { ping: "error", detail: "unreachable" };
  }
}

async function testChannel(
  channel: Channel,
  configRow: AgentConfigRow | undefined
): Promise<ChannelTestReport> {
  const resolution = await resolveDefaultChannelAccount(channel);

  switch (resolution.kind) {
    case "resolved": {
      const account = resolution.account;
      const hasCredential = Boolean(
        account.credentials.apiKey || account.credentials.accessToken
      );
      const { ping, detail } = hasCredential
        ? await pingProvider(account.provider, account.credentials)
        : { ping: "skipped" as const };
      return {
        channel,
        status: "resolved",
        provider: account.provider,
        hasCredential,
        ping,
        pingDetail: detail,
      };
    }
    case "unprovisioned": {
      // Legacy install — whatsapp sends through env YCloud creds; telegram
      // has no env path, its token lives in the scoped row's botTokenEnc.
      const scoped = decryptIfEncrypted(
        channel === "telegram"
          ? (configRow?.botTokenEnc ?? "")
          : (configRow?.ycloudApiKeyEnc ?? "")
      );
      const key = (
        scoped ||
        (channel === "whatsapp" ? (process.env.YCLOUD_API_KEY ?? "") : "")
      ).trim();
      const provider = channel === "telegram" ? "telegram" : "ycloud";
      const creds =
        provider === "telegram"
          ? { apiKey: "", accessToken: key }
          : { apiKey: key };
      const { ping, detail } = key
        ? await pingProvider(provider, creds)
        : { ping: "skipped" as const };
      return {
        channel,
        status: "unprovisioned",
        provider,
        hasCredential: Boolean(key),
        ping,
        pingDetail: detail,
      };
    }
    case "db-error":
      return { channel, status: "db-error", hasCredential: false, ping: "skipped" };
    case "ambiguous":
      return { channel, status: "ambiguous", hasCredential: false, ping: "skipped" };
    default:
      return { channel, status: "not-found", hasCredential: false, ping: "skipped" };
  }
}

export async function runAgentConfigTest(): Promise<AgentTestReport> {
  const resolution = await resolveAgentConfigStrict({});
  const row = resolution.kind === "resolved" ? resolution.row : undefined;

  const runtime = resolveRuntimeFromConfig(
    row
      ? {
          provider: row.provider,
          model: row.model,
          systemPrompt: row.systemPrompt,
          enabledTools: row.enabledTools,
          providerKeyEnc: row.providerKeyEnc,
          providerEndpointUrl: row.providerEndpointUrl,
        }
      : null
  );

  const channels = await Promise.all([
    testChannel("whatsapp", row),
    testChannel("telegram", row),
  ]);

  const channelsReady = channels.every(
    (report) =>
      report.status === "unprovisioned" ||
      (report.status === "resolved" && report.hasCredential)
  );

  return {
    ok:
      resolution.kind === "resolved" &&
      row?.enabled !== false &&
      runtime.configured &&
      channelsReady,
    config: {
      resolved: resolution.kind === "resolved",
      scope: "global",
      source: resolution.kind === "resolved" ? resolution.source : undefined,
      enabled: row ? row.enabled !== false : null,
      provider: row?.provider ?? null,
      model: row?.model ?? null,
      hasSystemPrompt: Boolean(row?.systemPrompt?.trim()),
      enabledTools: row?.enabledTools?.length ?? 0,
      aiConfigured: runtime.configured,
      aiMissing: runtime.configured ? [] : runtime.missing,
    },
    channels,
  };
}
