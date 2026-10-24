/**
 * AI provider catalog for /admin/agent.
 *
 * Each entry knows how to reach the vendor's models endpoint (base URL, path
 * and auth style) and carries a static model list used as fallback when the
 * live listing fails. `provider` values stored in `agent_config` may be these
 * catalog ids; `registry.ts` maps each entry's `protocol` to a chat adapter.
 *
 * This module is pure (no env, no DB, no server-only): the client form reads
 * labels/defaults, the server action performs the fetch.
 */

import { CHAT_COMPLETIONS_PROTOCOL } from "@/lib/ai/adapters/chat-completions";

export type AiProviderAuthStyle = "bearer" | "x-api-key" | "query-key";

export interface AiProviderCatalogEntry {
  id: string;
  label: string;
  /** Base URL shown in the endpoint field; also the models-call base. */
  defaultBaseUrl: string;
  modelsPath: string;
  authStyle: AiProviderAuthStyle;
  /** Extra headers for the models call (e.g. anthropic-version). */
  modelsHeaders?: Record<string, string>;
  /** Raw-entry filter applied before id extraction (e.g. generateContent). */
  modelsFilter?: (entry: unknown) => boolean;
  /** Chat-runtime base when it differs from defaultBaseUrl (openai-compat). */
  chatBaseUrl?: string;
  /** Wire protocol resolved to an adapter by `createChatProvider`. */
  protocol: string;
  staticModels: string[];
  defaultModel: string;
}

const CHAT_COMPLETIONS = CHAT_COMPLETIONS_PROTOCOL;

export const AI_PROVIDERS: readonly AiProviderCatalogEntry[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    defaultBaseUrl: "https://api.deepseek.com",
    modelsPath: "/models",
    authStyle: "bearer",
    protocol: CHAT_COMPLETIONS,
    staticModels: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat",
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    modelsPath: "/models",
    authStyle: "bearer",
    protocol: CHAT_COMPLETIONS,
    staticModels: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o4-mini"],
    defaultModel: "gpt-4o-mini",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    modelsPath: "/v1/models",
    authStyle: "x-api-key",
    modelsHeaders: { "anthropic-version": "2023-06-01" },
    // Anthropic speaks the Messages API, not chat-completions: the runtime
    // reports it as unsupported until an anthropic-messages adapter exists.
    protocol: "anthropic-messages",
    staticModels: ["claude-sonnet-4-20250514", "claude-haiku-4-5", "claude-opus-4-1"],
    defaultModel: "claude-sonnet-4-20250514",
  },
  {
    id: "google",
    label: "Google AI (Gemini)",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    modelsPath: "/v1beta/models",
    authStyle: "query-key",
    modelsFilter: (entry) => {
      const methods = (entry as { supportedGenerationMethods?: unknown })?.supportedGenerationMethods;
      return Array.isArray(methods) && methods.includes("generateContent");
    },
    // Gemini's OpenAI-compatible surface serves chat/completions under this base.
    chatBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    protocol: CHAT_COMPLETIONS,
    staticModels: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
    defaultModel: "gemini-2.5-flash",
  },
  {
    id: "groq",
    label: "Groq",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    modelsPath: "/models",
    authStyle: "bearer",
    protocol: CHAT_COMPLETIONS,
    staticModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-120b"],
    defaultModel: "llama-3.3-70b-versatile",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    modelsPath: "/models",
    authStyle: "bearer",
    protocol: CHAT_COMPLETIONS,
    staticModels: [],
    defaultModel: "",
  },
  {
    id: "mistral",
    label: "Mistral",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    modelsPath: "/models",
    authStyle: "bearer",
    protocol: CHAT_COMPLETIONS,
    staticModels: ["mistral-large-latest", "mistral-small-latest"],
    defaultModel: "mistral-large-latest",
  },
  {
    id: "together",
    label: "Together AI",
    defaultBaseUrl: "https://api.together.xyz/v1",
    modelsPath: "/models",
    authStyle: "bearer",
    protocol: CHAT_COMPLETIONS,
    staticModels: [],
    defaultModel: "",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    defaultBaseUrl: "https://api.x.ai/v1",
    modelsPath: "/models",
    authStyle: "bearer",
    protocol: CHAT_COMPLETIONS,
    staticModels: ["grok-4", "grok-3"],
    defaultModel: "grok-4",
  },
];

const byId = new Map(AI_PROVIDERS.map((entry) => [entry.id, entry]));

/** Catalog lookup by id (case-insensitive). Custom/unknown ids return undefined. */
export function findAiProvider(id: string | null | undefined): AiProviderCatalogEntry | undefined {
  return id ? byId.get(id.trim().toLowerCase()) : undefined;
}

/**
 * Normalizes an admin-entered endpoint field into a models-call base URL:
 * trailing slashes and a trailing `/chat/completions` are stripped, so both
 * base URLs and full endpoint URLs resolve to the same base.
 */
export function providerBaseUrl(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/+$/, "");
  if (!trimmed) return undefined;
  const withoutChatPath = trimmed.replace(/\/chat\/completions$/i, "");
  return withoutChatPath || trimmed;
}

const MODELS_TIMEOUT_MS = 10_000;

export type ProviderModelsResult =
  | { ok: true; models: string[] }
  | { ok: false; error: string };

function extractModelId(entry: unknown): string | undefined {
  if (entry === null || typeof entry !== "object") return undefined;
  const raw = (entry as { id?: unknown; name?: unknown });
  if (typeof raw.id === "string" && raw.id) return raw.id;
  // Google shape: { name: "models/gemini-2.5-pro", ... } — strip the prefix.
  if (typeof raw.name === "string" && raw.name) return raw.name.replace(/^models\//, "");
  return undefined;
}

/**
 * Fetches a provider's real model list. Uses the entry's auth style (bearer /
 * x-api-key / ?key=); a missing key still queries open providers like
 * OpenRouter. Unknown provider ids are treated as an OpenAI-compatible
 * `/models` endpoint. Never throws — failures return `{ ok: false, error }`.
 */
export async function fetchProviderModels(
  providerId: string,
  baseUrl: string | undefined,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderModelsResult> {
  const entry = findAiProvider(providerId);
  const base = providerBaseUrl(baseUrl ?? entry?.defaultBaseUrl);
  if (!base) return { ok: false, error: "Falta la URL base del proveedor." };

  const modelsPath = entry?.modelsPath ?? "/models";
  const authStyle = entry?.authStyle ?? "bearer";
  const key = apiKey?.trim();

  let url = `${base}${modelsPath}`;
  const headers: Record<string, string> = { ...(entry?.modelsHeaders ?? {}) };
  if (authStyle === "bearer" && key) headers.authorization = `Bearer ${key}`;
  if (authStyle === "x-api-key" && key) headers["x-api-key"] = key;
  if (authStyle === "query-key") url += `?key=${encodeURIComponent(key ?? "")}`;

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
      cache: "no-store" as RequestCache,
    });
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = (json as { error?: { message?: string } } | null)?.error?.message;
      return { ok: false, error: `HTTP ${response.status}${message ? `: ${message}` : ""}` };
    }
    const raw = (json as { data?: unknown; models?: unknown } | null) ?? null;
    const list = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.models) ? raw.models : [];
    const filter = entry?.modelsFilter;
    const ids = new Set<string>();
    for (const item of list) {
      if (filter && !filter(item)) continue;
      const id = extractModelId(item);
      if (id) ids.add(id);
    }
    return { ok: true, models: [...ids].sort() };
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "unreachable";
    return { ok: false, error: reason };
  }
}
