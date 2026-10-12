import { CHAT_COMPLETIONS_PROTOCOL, createChatCompletionsProvider } from "@/lib/ai/adapters/chat-completions";
import { ChatProviderError, type ChatProvider } from "@/lib/ai/provider";
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
  const protocol = runtime.provider.trim().toLowerCase();
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
