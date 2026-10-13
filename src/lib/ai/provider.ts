/**
 * Provider-neutral chat runtime contract.
 *
 * Nothing in this module names a vendor, a model or an endpoint: the concrete
 * adapter is chosen at runtime from DB configuration (see `config.ts` and
 * `registry.ts`). The agent loop depends only on `ChatProvider`, so switching
 * provider/model is a data change, never a code change.
 */

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ChatToolCall = {
  /** Provider-issued call id used to correlate the tool result. */
  id: string;
  /** Tool id/name requested by the model. */
  name: string;
  /** Raw JSON string of arguments exactly as returned by the provider. */
  arguments: string;
};

export type ChatMessage = {
  role: ChatRole;
  content: string;
  /** Present on `tool` messages: the id of the call being answered. */
  toolCallId?: string;
  /** Present on `assistant` messages that requested tools. */
  toolCalls?: ChatToolCall[];
  /** Optional display name (tool id for tool results). */
  name?: string;
};

/** Minimal JSON-schema description handed to the provider for a tool. */
export type ToolParameterSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type ToolSpec = {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
};

export type ChatCompletionRequest = {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  temperature?: number;
  maxTokens?: number;
  toolChoice?: "auto" | "none";
};

export type ChatCompletion = {
  content: string | null;
  toolCalls: ChatToolCall[];
  finishReason: string;
};

export interface ChatProvider {
  /** Stable adapter id — a wire-protocol name, never a vendor default. */
  readonly id: string;
  complete(request: ChatCompletionRequest): Promise<ChatCompletion>;
}

export type ChatProviderErrorCode =
  | "not_configured"
  | "unsupported_provider"
  | "provider_error"
  | "invalid_response";

export class ChatProviderError extends Error {
  readonly code: ChatProviderErrorCode;

  constructor(message: string, code: ChatProviderErrorCode = "provider_error") {
    super(message);
    this.name = "ChatProviderError";
    this.code = code;
  }
}
