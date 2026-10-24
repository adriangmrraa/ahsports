import { CHAT_COMPLETIONS_PROTOCOL, createChatCompletionsProvider } from "@/lib/ai/adapters/chat-completions";
import { ChatProviderError, type ChatProvider } from "@/lib/ai/provider";
import { findAiProvider } from "@/lib/ai/providers-catalog";
import type { ResolvedAgentRuntime } from "@/lib/ai/config";

/**
 * Provider registry.
 *
 * Maps a configured protocol id (DB `agent_config.provider`) to an adapter that
 * implements `ChatProvider`. The built-in id below is a *wire protocol*, not a
 * vendor: the vendor, model, credentials and endpoint all arrive from DB
 * configuration + environment, so no provider or model is hardcoded.
 *
 * New adapters are registered with `registerChatProvider` — the loop never
 * imports an adapter directly.
 */

export type ChatProviderFactory = (runtime: ResolvedAgentRuntime) => ChatProvider;

const registry = new Map<string, ChatProviderFactory>();

export function registerChatProvider(protocol: string, factory: ChatProviderFactory): void {
  const key = protocol.trim().toLowerCase();
  if (!key) throw new ChatProviderError("Protocol id vacío.", "unsupported_provider");
  registry.set(key, factory);
}

export function listRegisteredProtocols(): string[] {
  return [...registry.keys()].sort();
}

export function createChatProvider(runtime: ResolvedAgentRuntime): ChatProvider {
  const provider = runtime.provider.trim().toLowerCase();
  // `agent_config.provider` may hold a wire-protocol id (chat-completions) or a
  // catalog vendor id (openai, deepseek, …) — the entry's `protocol` field maps
  // it to the adapter that speaks its chat API.
  const protocol = registry.has(provider)
    ? provider
    : (findAiProvider(provider)?.protocol ?? provider);
  const factory = registry.get(protocol);
  if (!factory) {
    throw new ChatProviderError(
      `Protocolo de proveedor no soportado: "${runtime.provider}". Registrados: ${listRegisteredProtocols().join(", ")}.`,
      "unsupported_provider",
    );
  }
  return factory(runtime);
}

registerChatProvider(CHAT_COMPLETIONS_PROTOCOL, (runtime) =>
  createChatCompletionsProvider({
    model: runtime.model,
    apiKey: runtime.apiKey,
    endpointUrl: runtime.endpointUrl,
  }),
);
