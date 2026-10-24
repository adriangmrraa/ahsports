import { z } from "zod";
import { buildSystemPrompt } from "@/lib/agents/system-prompt";
import { decryptIfEncrypted } from "@/lib/crypto/secret-box";
import {
  findAiProvider,
  type AiProviderCatalogEntry,
} from "@/lib/ai/providers-catalog";

/**
 * Agent runtime configuration.
 *
 * Provider, model, system prompt and enabled tools are resolved from the
 * `agent_config` DB row (singleton, id = 1, or a scoped row). Credentials and
 * the endpoint resolve from the row first — `provider_key_enc` (decrypted) and
 * `provider_endpoint_url` — then fall back to environment variables. Nothing
 * here hardcodes a vendor, a model or a host, so switching provider/model is a
 * data change.
 */

export const AGENT_CONFIG_ID = 1;

/** Protocol path used only as a default when no explicit endpoint is configured. */
export const DEFAULT_CHAT_COMPLETIONS_PATH = "/chat/completions";

export const agentConfigRowSchema = z.object({
  provider: z.string().trim().nullable(),
  model: z.string().trim().nullable(),
  systemPrompt: z.string().nullable(),
  enabledTools: z.array(z.string()).nullable(),
  providerKeyEnc: z.string().nullable(),
  providerEndpointUrl: z.string().nullable(),
});

export type AgentConfigRow = z.infer<typeof agentConfigRowSchema>;

export type ResolvedAgentRuntime = {
  provider: string;
  model: string;
  systemPrompt: string;
  enabledTools: string[];
  /** Fully resolved request endpoint (base URL + path, or an explicit URL). */
  endpointUrl: string;
  apiKey: string;
};

export type MissingConfigKey = "provider" | "model" | "endpoint" | "api_key";

export type AgentRuntimeResolution =
  | { configured: true; runtime: ResolvedAgentRuntime }
  | { configured: false; reason: "no_config_row" | "incomplete_config"; missing: MissingConfigKey[] };

type EnvRecord = Record<string, string | undefined>;

function clean(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** `AGENT_AI_<PROVIDER>_<SUFFIX>` — provider segment is normalized, not hardcoded. */
export function providerEnv(env: EnvRecord, provider: string, suffix: string): string | undefined {
  const normalized = provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return clean(env[`AGENT_AI_${normalized}_${suffix}`]);
}

function sameUrl(a: string, b: string): boolean {
  return a.replace(/\/+$/, "").toLowerCase() === b.replace(/\/+$/, "").toLowerCase();
}

/**
 * Normalizes the admin-entered endpoint field into a fully resolved endpoint.
 * The field holds a base URL for catalog providers (autofilled with
 * `defaultBaseUrl`); a value already ending in the chat path is taken as a
 * full endpoint URL verbatim.
 */
function storedEndpointUrl(
  value: string | null | undefined,
  path: string,
  catalogEntry: AiProviderCatalogEntry | undefined,
): string | undefined {
  let stored = clean(value);
  if (!stored) return undefined;
  stored = stored.replace(/\/+$/, "");
  // An untouched catalog autofill resolves through the entry's chat base —
  // it differs from `defaultBaseUrl` when the models API and the chat API
  // live on different paths (e.g. Google's OpenAI-compatible surface).
  if (catalogEntry && sameUrl(stored, catalogEntry.defaultBaseUrl)) {
    stored = catalogEntry.chatBaseUrl ?? catalogEntry.defaultBaseUrl;
  }
  if (stored.toLowerCase().endsWith(path.toLowerCase())) return stored;
  if (/\/chat\/completions$/i.test(stored)) return stored;
  return joinUrl(stored, path);
}

function catalogDefaultEndpoint(
  catalogEntry: AiProviderCatalogEntry | undefined,
  path: string,
): string | undefined {
  if (!catalogEntry) return undefined;
  return joinUrl(catalogEntry.chatBaseUrl ?? catalogEntry.defaultBaseUrl, path);
}

function joinUrl(base: string | undefined, path: string): string | undefined {
  if (!base) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  const trimmedBase = base.replace(/\/+$/, "");
  const trimmedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${trimmedPath}`;
}

/**
 * Pure resolver: takes an already-loaded config row (or null) plus an env
 * record and returns either a fully resolved runtime or the list of missing
 * keys. No I/O, so it is unit-checkable without a database.
 */
export function resolveRuntimeFromConfig(
  row: AgentConfigRow | null,
  env: EnvRecord = process.env,
): AgentRuntimeResolution {
  if (!row) return { configured: false, reason: "no_config_row", missing: ["provider", "model"] };

  const provider = clean(row.provider);
  const model = clean(row.model);
  const missing: MissingConfigKey[] = [];
  if (!provider) missing.push("provider");
  if (!model) missing.push("model");

  let endpointUrl: string | undefined;
  let apiKey: string | undefined;
  if (provider) {
    const catalogEntry = findAiProvider(provider);
    const explicitEndpoint = providerEnv(env, provider, "ENDPOINT_URL") ?? clean(env.AGENT_AI_ENDPOINT_URL);
    const baseUrl = providerEnv(env, provider, "BASE_URL") ?? clean(env.AGENT_AI_BASE_URL);
    const path = clean(env.AGENT_AI_ENDPOINT_PATH) ?? DEFAULT_CHAT_COMPLETIONS_PATH;
    endpointUrl =
      storedEndpointUrl(row.providerEndpointUrl, path, catalogEntry) ??
      explicitEndpoint ??
      joinUrl(baseUrl, path) ??
      catalogDefaultEndpoint(catalogEntry, path);
    // The DB-stored key wins over env. A decryption failure reads as missing
    // (`decryptIfEncrypted` returns "" and never throws).
    apiKey =
      clean(decryptIfEncrypted(row.providerKeyEnc)) ??
      providerEnv(env, provider, "API_KEY") ??
      clean(env.AGENT_AI_API_KEY);
  }

  if (!endpointUrl) missing.push("endpoint");
  if (!apiKey) missing.push("api_key");

  if (missing.length > 0 || !provider || !model || !endpointUrl || !apiKey) {
    return { configured: false, reason: "incomplete_config", missing };
  }

  return {
    configured: true,
    runtime: {
      provider,
      model,
      systemPrompt: clean(row.systemPrompt) ?? buildSystemPrompt(),
      enabledTools: row.enabledTools ?? [],
      endpointUrl,
      apiKey,
    },
  };
}

/**
 * Loads the singleton `agent_config` row. Uses a dynamic import so this module
 * stays importable without a database connection for pure-function checks.
 */
export async function loadAgentConfigRow(): Promise<AgentConfigRow | null> {
  const [{ db }, { agentConfig }] = await Promise.all([
    import("@/db/client"),
    import("@/db/schema"),
  ]);
  const { eq } = await import("drizzle-orm");
  const [row] = await db
    .select({
      provider: agentConfig.provider,
      model: agentConfig.model,
      systemPrompt: agentConfig.systemPrompt,
      enabledTools: agentConfig.enabledTools,
      providerKeyEnc: agentConfig.providerKeyEnc,
      providerEndpointUrl: agentConfig.providerEndpointUrl,
    })
    .from(agentConfig)
    .where(eq(agentConfig.id, AGENT_CONFIG_ID))
    .limit(1);
  if (!row) return null;
  const parsed = agentConfigRowSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
}

/** Resolves the runtime from DB config + env. */
export async function resolveAgentRuntime(
  env: EnvRecord = process.env,
): Promise<AgentRuntimeResolution> {
  const row = await loadAgentConfigRow();
  return resolveRuntimeFromConfig(row, env);
}
