import { z } from "zod";
import {
  ChatProviderError,
  type ChatCompletion,
  type ChatCompletionRequest,
  type ChatMessage,
  type ChatProvider,
  type ToolSpec,
} from "@/lib/ai/provider";

/**
 * Fetch-based adapter for the de-facto "chat completions" wire protocol.
 *
 * This is a message *dialect*, not a vendor: the model, API key and fully
 * resolved endpoint URL are injected from configuration/env by the registry, so
 * no vendor, model or host is named in code. The only dependency is `fetch`.
 */

export type ChatCompletionsOptions = {
  model: string;
  apiKey: string;
  /** Fully resolved request URL (from config/env — never hardcoded). */
  endpointUrl: string;
  /** Extra headers (e.g. auth scheme) merged over the defaults. */
  headers?: Record<string, string>;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
};

export const CHAT_COMPLETIONS_PROTOCOL = "chat-completions";

const errorResponseSchema = z
  .object({ error: z.object({ message: z.string().optional() }).partial().optional() })
  .passthrough();

const completionResponseSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: z
              .object({
                content: z.string().nullable().optional(),
                tool_calls: z
                  .array(
                    z
                      .object({
                        id: z.string().optional(),
                        type: z.string().optional(),
                        function: z.object({ name: z.string(), arguments: z.string().optional().default("") }),
                      })
                      .passthrough(),
                  )
                  .optional(),
              })
              .passthrough(),
            finish_reason: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

function toProviderMessage(message: ChatMessage): Record<string, unknown> {
  switch (message.role) {
    case "system":
      return { role: "system", content: message.content };
    case "assistant": {
      const payload: Record<string, unknown> = { role: "assistant", content: message.content || null };
      if (message.toolCalls && message.toolCalls.length > 0) {
        payload.tool_calls = message.toolCalls.map((call, index) => ({
          id: call.id || `call_${index}`,
          type: "function",
          function: { name: call.name, arguments: call.arguments || "{}" },
        }));
      }
      return payload;
    }
    case "tool":
      return {
        role: "tool",
        tool_call_id: message.toolCallId ?? "",
        content: message.content,
      };
    default:
      return { role: "user", content: message.content };
  }
}

function toProviderTools(tools: ToolSpec[] | undefined): Array<Record<string, unknown>> | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function createChatCompletionsProvider(options: ChatCompletionsOptions): ChatProvider {
  const { model, apiKey, endpointUrl } = options;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    id: CHAT_COMPLETIONS_PROTOCOL,
    async complete(request: ChatCompletionRequest): Promise<ChatCompletion> {
      const body: Record<string, unknown> = {
        model,
        messages: request.messages.map(toProviderMessage),
      };
      const tools = toProviderTools(request.tools);
      if (tools) body.tools = tools;
      if (typeof request.temperature === "number") body.temperature = request.temperature;
      if (typeof request.maxTokens === "number") body.max_tokens = request.maxTokens;
      if (request.toolChoice) body.tool_choice = request.toolChoice;

      let response: Response;
      try {
        response = await fetchImpl(endpointUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
            ...options.headers,
          },
          body: JSON.stringify(body),
          cache: "no-store" as RequestCache,
        });
      } catch {
        throw new ChatProviderError("No se pudo contactar al proveedor de IA.", "provider_error");
      }

      const json: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const parsed = errorResponseSchema.safeParse(json);
        const detail = parsed.success ? parsed.data.error?.message : undefined;
        throw new ChatProviderError(
          `El proveedor de IA respondió ${response.status}${detail ? `: ${detail}` : "."}`,
          "provider_error",
        );
      }

      const parsed = completionResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new ChatProviderError("Respuesta inválida del proveedor de IA.", "invalid_response");
      }

      const choice = parsed.data.choices[0];
      const toolCalls = (choice.message.tool_calls ?? []).map((call, index) => ({
        id: call.id ?? `call_${index}`,
        name: call.function.name,
        arguments: call.function.arguments ?? "",
      }));

      return {
        content: choice.message.content ?? null,
        toolCalls,
        finishReason: choice.finish_reason ?? (toolCalls.length > 0 ? "tool_calls" : "stop"),
      };
    },
  };
}
